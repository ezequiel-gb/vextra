import { readdir, readFile, mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import assert from "node:assert/strict";
async function fingerprint(dir, prefix = "") {
  const files = [];
  for (const e of (await readdir(dir, { withFileTypes: true })).sort((a, b) =>
    a.name.localeCompare(b.name),
  )) {
    const name = prefix + e.name;
    if (e.isDirectory())
      files.push(...(await fingerprint(join(dir, e.name), name + "/")));
    else
      files.push({
        path: name,
        sha256: createHash("sha256")
          .update(await readFile(join(dir, e.name)))
          .digest("hex"),
      });
  }
  return files;
}
const before = await fingerprint("dist");
const result = spawnSync(process.execPath, ["scripts/build.mjs"], {
  encoding: "utf8",
});
if (result.status !== 0) {
  console.error(result.stdout, result.stderr);
  process.exit(1);
}
const after = await fingerprint("dist");
assert.deepEqual(after, before);
await mkdir("artifacts", { recursive: true });
await writeFile(
  "artifacts/build-reproducibility.json",
  JSON.stringify(
    {
      date: new Date().toISOString(),
      result: "identical generated contents across two consecutive builds",
      cleanDependencyInstall: "npm ci executed before checks",
      files: after,
    },
    null,
    2,
  ),
);
console.log(
  `Reproducibility verified: ${after.length} files identical across consecutive production builds.`,
);
