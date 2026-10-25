import { readFile, readdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
const lock = JSON.parse(await readFile("package-lock.json", "utf8"));
let out =
  "# Third-party notices\n\nVextra is licensed under MIT; see LICENSE. This file inventories installed production dependencies and retains their available licence texts. Development-only tools are recorded in package-lock.json and are not bundled runtime dependencies. The original Vextra icon and interface assets are distributed under the project MIT Licence.\n\n";
const packages = [];
for (const [path, entry] of Object.entries(lock.packages)) {
  if (!path || entry.dev) continue;
  const pkg = JSON.parse(await readFile(join(path, "package.json"), "utf8"));
  packages.push({ path, pkg });
}
out +=
  "| Package | Version | Declared licence |\n|---|---|---|\n" +
  packages
    .map(
      ({ pkg }) =>
        `| ${pkg.name} | ${pkg.version} | ${typeof pkg.license === "string" ? pkg.license : JSON.stringify(pkg.license ?? "See package license")} |`,
    )
    .join("\n") +
  "\n\n";
for (const { path, pkg } of packages) {
  out += `## ${pkg.name} ${pkg.version}\n\n`;
  const licenses = (await readdir(path)).filter((name) =>
    /^(licen[cs]e|copying|notice)(\.|$)/i.test(name),
  );
  let recorded = 0;
  for (const name of licenses)
    try {
      out += `### ${name}\n\n\`\`\`text\n${await readFile(join(path, name), "utf8")}\n\`\`\`\n\n`;
      recorded++;
    } catch {
      /* Directory named license: package inventory still identifies its owner. */
    }
  if (!recorded)
    throw new Error(
      `Missing redistribution notice for ${pkg.name} ${pkg.version}`,
    );
}
await writeFile("THIRD-PARTY-NOTICES.md", out.trimEnd() + "\n");
console.log(
  `Recorded ${packages.length} production dependency licence entries`,
);
