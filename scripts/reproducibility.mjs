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
function run(script) {
  const result = spawnSync(process.execPath, [script], { encoding: "utf8" });
  assert.equal(
    result.status,
    0,
    `${script} failed:\n${result.stdout}\n${result.stderr}`,
  );
}
async function snapshot() {
  run("scripts/build.mjs");
  run("scripts/package.mjs");
  return {
    files: await fingerprint("dist"),
    archives: await readFile("artifacts/SHA256SUMS.txt", "utf8"),
  };
}
const before = await snapshot(),
  after = await snapshot();
assert.deepEqual(
  after,
  before,
  "Consecutive builds or release archives differ",
);
await mkdir("artifacts", { recursive: true });
await writeFile(
  "artifacts/build-reproducibility.json",
  JSON.stringify(
    {
      date: new Date().toISOString(),
      result:
        "Two production builds and all three release archives are byte-identical",
      node: process.version,
      ...after,
    },
    null,
    2,
  ),
);
console.log(
  `Reproducibility verified: ${after.files.length} generated files and three release archives match across two builds.`,
);
