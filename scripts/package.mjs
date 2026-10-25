import "./validate.mjs";
import "./notices.mjs";
import { readFile, readdir, writeFile, mkdir } from "node:fs/promises";
import { join } from "node:path";
import { createHash } from "node:crypto";
import { zipSync, strToU8 } from "fflate";
await mkdir("artifacts", { recursive: true });
const { version } = JSON.parse(await readFile("package.json", "utf8"));
const hashes = [];
// ZIP stores local calendar fields, so use a fixed wall-clock value in every timezone.
const archiveTime = new Date(2020, 0, 1, 0, 0, 0);
for (const variant of ["chromium-panel", "chromium-tab"]) {
  const entries = {};
  const add = async (dir, prefix = "") => {
    for (const entry of (await readdir(dir, { withFileTypes: true })).sort(
      (a, b) => a.name.localeCompare(b.name),
    )) {
      const name = prefix + entry.name;
      if (entry.isDirectory()) await add(join(dir, entry.name), name + "/");
      else
        entries[name] = [
          new Uint8Array(await readFile(join(dir, entry.name))),
          { mtime: archiveTime },
        ];
    }
  };
  await add(`dist/${variant}`);
  await add("assets", "assets/");
  for (const name of [
    "ARCHITECTURE.md",
    "INSTALLATION.md",
    "USER-GUIDE.md",
    "PRIVACY.md",
    "LIMITATIONS.md",
    "JSON-SCHEMA.md",
    "transcript.schema.json",
    "VALIDATION.md",
  ])
    entries[`docs/${name}`] = [
      new Uint8Array(await readFile(`docs/${name}`)),
      { mtime: archiveTime },
    ];
  for (const name of [
    "README.md",
    "LICENSE",
    "THIRD-PARTY-NOTICES.md",
    "CONTRIBUTING.md",
    "SECURITY.md",
  ])
    entries[name] = [
      strToU8(await readFile(name, "utf8")),
      { mtime: archiveTime },
    ];
  const bytes = zipSync(entries, { level: 9 }),
    name =
      variant === "chromium-panel"
        ? `Vextra-${version}-chromium.zip`
        : `Vextra-${version}-${variant}.zip`;
  await writeFile(`artifacts/${name}`, bytes);
  hashes.push(`${createHash("sha256").update(bytes).digest("hex")}  ${name}`);
}
const sourceEntries = {};
const sourceAdd = async (dir, prefix = "") => {
  for (const entry of (await readdir(dir, { withFileTypes: true })).sort(
    (a, b) => a.name.localeCompare(b.name),
  )) {
    const name = prefix + entry.name;
    if (
      [
        "docs/DEVELOPMENT-PLAN.md",
        "docs/EXTRACTION-VALIDATION.md",
        "docs/VALIDATION-REPORT.md",
        "docs/TEST-MATRIX.md",
      ].includes(name)
    )
      continue;
    if (entry.isDirectory()) await sourceAdd(join(dir, entry.name), name + "/");
    else
      sourceEntries[name] = [
        new Uint8Array(await readFile(join(dir, entry.name))),
        { mtime: archiveTime },
      ];
  }
};
for (const dir of [
  "src",
  "scripts",
  "tests",
  "public",
  "docs",
  "assets",
  ".github",
])
  await sourceAdd(dir, dir + "/");
for (const name of [
  "package.json",
  "package-lock.json",
  "tsconfig.json",
  "vite.config.ts",
  "eslint.config.js",
  "panel.html",
  "settings.html",
  ".node-version",
  ".gitignore",
  ".gitattributes",
  "LICENSE",
  "CONTRIBUTING.md",
  "SECURITY.md",
  "README.md",
  "THIRD-PARTY-NOTICES.md",
  "VEXTRA-IMPLEMENTATION-SPECIFICATION.md",
])
  sourceEntries[name] = [
    new Uint8Array(await readFile(name)),
    { mtime: archiveTime },
  ];
const sourceBytes = zipSync(sourceEntries, { level: 9 }),
  sourceName = `Vextra-${version}-source.zip`;
await writeFile(`artifacts/${sourceName}`, sourceBytes);
hashes.push(
  `${createHash("sha256").update(sourceBytes).digest("hex")}  ${sourceName}`,
);
await writeFile("artifacts/SHA256SUMS.txt", hashes.join("\n") + "\n");
console.log(hashes.join("\n"));
