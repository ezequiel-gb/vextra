import { readFile, readdir, stat } from "node:fs/promises";
import { resolve, join } from "node:path";
import assert from "node:assert/strict";
for (const variant of ["chromium-panel", "chromium-tab"]) {
  const dir = resolve("dist", variant),
    manifest = JSON.parse(await readFile(join(dir, "manifest.json"), "utf8"));
  assert.equal(manifest.manifest_version, 3);
  const paths = [
    manifest.background.service_worker,
    manifest.options_ui.page,
    ...Object.values(manifest.icons),
    ...(manifest.side_panel ? [manifest.side_panel.default_path] : []),
    ...manifest.content_scripts.flatMap((s) => s.js),
  ];
  for (const path of paths) {
    assert(!path.includes(".."));
    assert((await stat(join(dir, path))).size > 0);
  }
  assert.deepEqual(
    [...manifest.host_permissions].sort(),
    [
      "https://m.youtube.com/*",
      "https://www.youtube.com/*",
      "https://youtube.com/*",
    ].sort(),
  );
  assert(!manifest.permissions.includes("tabs"));
  assert(!manifest.permissions.includes("cookies"));
  assert(!manifest.action.default_popup);
  assert(!manifest.content_security_policy.extension_pages.includes("unsafe-"));
  for (const file of await readdir(join(dir, "assets"))) {
    const text = await readFile(join(dir, "assets", file), "utf8");
    assert(!text.includes("localhost:5173"));
    assert(!text.includes("/@vite/client"));
    assert(!file.endsWith(".map"));
  }
  const html = await readFile(join(dir, "panel.html"), "utf8");
  for (const match of html.matchAll(/(?:src|href)="\.\/([^"]+)"/g))
    await stat(join(dir, match[1]));
  const nav = await readFile(join(dir, "navigation.js"), "utf8");
  assert(!/\bimport\s/.test(nav));
  console.log(
    `${variant}: manifest, resources, hosts, CSP and production entries verified`,
  );
}
// Core dependency-boundary validation catches transitive layering mistakes early.
async function walk(path) {
  const out = [];
  for (const e of await readdir(path, { withFileTypes: true })) {
    const p = join(path, e.name);
    out.push(...(e.isDirectory() ? await walk(p) : [p]));
  }
  return out;
}
for (const dir of ["model", "processing", "documents", "export"])
  for (const path of await walk(`src/${dir}`)) {
    const source = await readFile(path, "utf8");
    assert(
      !/from ['"][^'"]*\/(browser|source)\//.test(source),
      `Core boundary violation: ${path}`,
    );
  }
console.log("Pure core import boundaries verified");
