import { zipSync, strToU8 } from "fflate";
import type { Settings, Transcript, Format } from "../model/types.ts";
import { exportText, filename } from "./formats.ts";
import { VextraError } from "../model/errors.ts";
export function combinedMarkdown(
  docs: Transcript[],
  settings: Settings,
  total: number,
): string {
  return (
    `# Vextra batch\n\n${docs.length} of ${total} videos exported.\n\n` +
    docs
      .map((d) => {
        const used = new Set<string>(),
          anchors = new Map<string, string>();
        const body = exportText(d, { kind: "all" }, settings, "md")
          .replace(
            /^(#{1,5}) (.+)$/gm,
            (_match, hashes: string, title: string) => {
              const slug =
                title
                  .replace(/\\/g, "")
                  .toLowerCase()
                  .replace(/[^\p{L}\p{N}_ -]/gu, "")
                  .replace(/ /g, "-") || "section";
              const base = `v-${d.videoId}-${slug}`;
              let anchor = base,
                n = 2;
              while (used.has(anchor)) anchor = `${base}-${n++}`;
              used.add(anchor);
              if (!anchors.has(slug)) anchors.set(slug, anchor);
              return `<a id="${anchor}"></a>\n\n${hashes}# ${title}`;
            },
          )
          .replace(/\]\(#([^)]*)\)/g, (match, slug: string) =>
            anchors.has(slug) ? `](#${anchors.get(slug)})` : match,
          );
        return `<!-- video: ${d.videoId} -->\n\nSource: ${d.sourceUrl}\n\n${body}`;
      })
      .join("\n---\n\n")
  );
}
export async function archive(
  docs: Transcript[],
  settings: Settings,
  format: Format,
  statuses: unknown,
): Promise<Uint8Array> {
  if (!docs.length) throw new VextraError("EMPTY_TRANSCRIPT");
  const files: Record<string, Uint8Array> = {};
  let size = 0;
  for (const d of docs) {
    const name = filename(d, format, "{{title}}").replace(
      new RegExp(`\\.${format}$`),
      `-${d.videoId}.${format}`,
    );
    const value = strToU8(exportText(d, { kind: "all" }, settings, format));
    size += value.length;
    if (size > 100 * 1024 * 1024) throw new VextraError("LIMIT");
    files[name] = value;
  }
  files["batch-manifest.json"] = strToU8(JSON.stringify(statuses, null, 2));
  // Called inside our packaged compute worker. fflate's asynchronous API creates
  // blob workers, which are intentionally disallowed by the extension CSP.
  return zipSync(files, { level: 6 });
}
