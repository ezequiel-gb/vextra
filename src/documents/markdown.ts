import type {
  Settings,
  Transcript,
  Selection,
  Preset,
} from "../model/types.ts";
import { builtinBody } from "../model/types.ts";
import { VextraError } from "../model/errors.ts";
import { paragraphs, resolveSelection, time } from "../processing/text.ts";

export const escapeMd = (s: string): string =>
  s
    .replace(/[\\`*_{}[\]()#+.!|>~<-]/g, "\\$&")
    .replace(/^(\s*)(\d+)\./gm, "$1$2\\.");
export const presetOptions = (preset: Preset) => ({
  preset,
  metadata: true,
  timestamps: preset !== "clean",
  links: true,
  notes: preset === "research",
  templateId: "",
});
const keys = new Set([
  "title",
  "channel",
  "url",
  "duration",
  "language",
  "extracted_date",
  "chapters",
  "transcript",
  "notes",
]);
export function validateTemplate(body: string): void {
  if (new TextEncoder().encode(body).byteLength > 50 * 1024)
    throw new VextraError("INVALID_TEMPLATE");
  for (const m of body.matchAll(/{{([\s\S]*?)}}/g))
    if (!keys.has(m[1]!.trim())) throw new VextraError("INVALID_TEMPLATE");
  if (
    body.replace(/{{[\s\S]*?}}/g, "").includes("{{") ||
    body.replace(/{{[\s\S]*?}}/g, "").includes("}}")
  )
    throw new VextraError("INVALID_TEMPLATE");
}
export function expandTemplate(
  body: string,
  values: Record<string, string>,
): string {
  validateTemplate(body);
  return body.replace(
    /{{\s*(\w+)\s*}}/g,
    (_, key: string) => values[key] ?? "",
  );
}
export function markdown(
  doc: Transcript,
  selection: Selection,
  settings: Settings,
): string {
  const cues = resolveSelection(doc, selection);
  const blocks =
    settings.preset === "archive"
      ? cues.map((s) => ({
          ...s,
          segmentIds: [s.id],
          endMs: s.startMs + s.durationMs,
          chapterId: doc.chapters.findLast((c) => s.startMs >= c.startMs)?.id,
        }))
      : paragraphs(doc, cues, settings.paragraphs === "compact");
  let body = "";
  let previousChapter: string | undefined;
  for (const block of blocks) {
    if (block.chapterId && block.chapterId !== previousChapter) {
      const chapter = doc.chapters.find((c) => c.id === block.chapterId)!;
      body += `## ${escapeMd(chapter.title)}\n\n`;
      previousChapter = block.chapterId;
    }
    const timestamp = settings.timestamps
      ? (settings.links
          ? `[${time(block.startMs)}](${doc.sourceUrl}&t=${Math.floor(block.startMs / 1000)})`
          : `[${time(block.startMs)}]`) + " "
      : "";
    body += `${timestamp}${escapeMd(block.text)}\n\n`;
  }
  if (!doc.chapters.length) body = "## Transcript\n\n" + body;
  const notes = settings.notes ? "## Notes\n\n" : "";
  const template = settings.templates.find((t) => t.id === settings.templateId);
  if (template)
    return (
      expandTemplate(template.body, {
        title: escapeMd(doc.title ?? ""),
        channel: escapeMd(doc.channel ?? ""),
        url: settings.links ? doc.sourceUrl : "",
        duration: doc.durationMs === undefined ? "" : time(doc.durationMs),
        language: escapeMd(doc.language),
        extracted_date: doc.extractedAt,
        chapters: doc.chapters
          .filter((c) => blocks.some((b) => b.chapterId === c.id))
          .map(
            (c) =>
              `- ${escapeMd(c.title)}${settings.links ? ` ([${time(c.startMs)}](${doc.sourceUrl}&t=${Math.floor(c.startMs / 1000)}))` : ""}`,
          )
          .join("\n"),
        transcript: body.trimEnd(),
        notes,
      }).trimEnd() + "\n"
    );
  const metadata = settings.metadata
    ? [
        doc.channel && `Channel: ${escapeMd(doc.channel)}`,
        doc.durationMs !== undefined && `Duration: ${time(doc.durationMs)}`,
        `Language: ${escapeMd(doc.language)}`,
        `Captions: ${doc.captionType}`,
        settings.preset !== "clean" && `Extracted: ${doc.extractedAt}`,
      ]
        .filter(Boolean)
        .join("  \n")
    : "";
  return (
    [
      `# ${escapeMd(doc.title ?? "Transcript")}`,
      metadata,
      settings.links ? `[Source video](${doc.sourceUrl})` : "",
      body.trimEnd(),
      notes,
    ]
      .filter(Boolean)
      .join("\n\n")
      .trimEnd() + "\n"
  );
}
export { builtinBody };
