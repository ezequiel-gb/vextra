import { readFile, stat } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import { dirname, resolve, relative, isAbsolute } from "node:path";
import assert from "node:assert/strict";
const listing = spawnSync(
  "git",
  ["ls-files", "--cached", "--others", "--exclude-standard"],
  { encoding: "utf8" },
);
assert.equal(listing.status, 0, "Could not inspect the source tree");
const files = [...new Set(listing.stdout.trim().split(/\r?\n/))].filter((f) =>
  f.endsWith(".md"),
);
let checked = 0;
for (const file of files) {
  const body = (await readFile(file, "utf8")).replace(
    /^(```|~~~)[\s\S]*?^\1\s*$/gm,
    "",
  );
  const targets = [
    ...body.matchAll(
      /!?\[[^\]]*\]\(([^)]+)\)|<(?:img|a)\b[^>]*?(?:src|href)="([^"]+)"/g,
    ),
  ].map((m) => m[1] ?? m[2]);
  for (const target of targets) {
    if (/^(?:https?:|mailto:)/.test(target)) continue;
    const [path, anchor] = target.replace(/^<|>$/g, "").split("#");
    const destination = path
      ? resolve(dirname(file), decodeURIComponent(path))
      : resolve(file);
    const local = relative(resolve("."), destination);
    assert(
      !isAbsolute(local) &&
        local !== ".." &&
        !local.startsWith("..\\") &&
        !local.startsWith("../"),
      `${file}: link escapes the repository`,
    );
    await stat(destination).catch(() => {
      throw new Error(`${file}: missing link ${target}`);
    });
    if (anchor && destination.endsWith(".md")) {
      const text = await readFile(destination, "utf8");
      const headings = [...text.matchAll(/^#{1,6}\s+(.+)$/gm)].map((m) =>
        m[1]
          .toLowerCase()
          .replace(/[^\p{L}\p{N}_ -]/gu, "")
          .replace(/ /g, "-"),
      );
      assert(
        headings.includes(decodeURIComponent(anchor)),
        `${file}: missing heading ${target}`,
      );
    }
    checked++;
  }
}
console.log(
  `Verified ${checked} local documentation links across ${files.length} Markdown files.`,
);
