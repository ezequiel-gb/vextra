import { build } from "vite";
import { mkdir, writeFile, cp, rm, readFile } from "node:fs/promises";
import { resolve, dirname } from "node:path";
import { PNG } from "pngjs";
const { version } = JSON.parse(await readFile("package.json", "utf8"));
await build();
for (const [name, entry] of [
  ["background", "src/background/index.ts"],
  ["navigation", "src/content/navigation.ts"],
]) {
  await build({
    configFile: false,
    build: {
      outDir: "dist/chromium-panel",
      emptyOutDir: false,
      lib: {
        entry,
        formats: [name === "background" ? "es" : "iife"],
        name: "VextraNavigation",
        fileName: () => `${name}.js`,
      },
      sourcemap: false,
    },
  });
}
const dir = "dist/chromium-panel";
await mkdir(`${dir}/icons`, { recursive: true });
for (const n of [16, 32, 48, 128]) {
  const png = new PNG({ width: n, height: n });
  for (let y = 0; y < n; y++)
    for (let x = 0; x < n; x++) {
      const i = (y * n + x) * 4,
        u = x / n,
        v = y / n;
      const mark =
        v > 0.24 &&
        v < 0.74 &&
        Math.abs(Math.abs(u - 0.5) - (0.74 - v) * 0.55) < 0.065;
      png.data.set(mark ? [239, 193, 91, 255] : [34, 37, 39, 255], i);
    }
  await writeFile(`${dir}/icons/${n}.png`, PNG.sync.write(png));
}
const matches = [
  "https://www.youtube.com/*",
  "https://m.youtube.com/*",
  "https://youtube.com/*",
];
const manifest = {
  manifest_version: 3,
  name: "Vextra",
  version,
  description: "Turn accessible YouTube captions into reusable documents.",
  permissions: ["storage", "scripting", "downloads", "sidePanel"],
  host_permissions: matches,
  background: { service_worker: "background.js", type: "module" },
  action: { default_title: "Open Vextra" },
  side_panel: { default_path: "panel.html" },
  options_ui: { page: "settings.html", open_in_tab: true },
  icons: Object.fromEntries(
    [16, 32, 48, 128].map((n) => [n, `icons/${n}.png`]),
  ),
  content_scripts: [
    { matches, js: ["navigation.js"], run_at: "document_idle" },
  ],
  content_security_policy: {
    extension_pages:
      "default-src 'self'; script-src 'self'; worker-src 'self'; object-src 'none'; base-uri 'none'; frame-src 'none'; connect-src https://www.youtube.com https://m.youtube.com https://youtube.com; img-src 'self' data: https://i.ytimg.com; style-src 'self'; form-action 'none'",
  },
};
await writeFile(`${dir}/manifest.json`, JSON.stringify(manifest, null, 2));
const tabDir = resolve("dist/chromium-tab");
if (dirname(tabDir) !== resolve("dist"))
  throw new Error(
    "Refusing to clear output outside the generated dist directory",
  );
await rm(tabDir, { recursive: true, force: true });
await cp(dir, tabDir, { recursive: true, force: true });
delete manifest.side_panel;
manifest.permissions = manifest.permissions.filter((p) => p !== "sidePanel");
await writeFile(
  "dist/chromium-tab/manifest.json",
  JSON.stringify(manifest, null, 2),
);
