import type {
  Format,
  Selection,
  Settings,
  Transcript,
} from "../model/types.ts";
import { markdown } from "../documents/markdown.ts";
import { paragraphs, resolveSelection, time } from "../processing/text.ts";
import { boundedExport } from "../model/limits.ts";
import { validatedTranscript } from "../model/validate.ts";
export function exportText(
  doc: Transcript,
  selection: Selection,
  settings: Settings,
  format: Format,
): string {
  return boundedExport(formatText(doc, selection, settings, format));
}
function formatText(
  doc: Transcript,
  selection: Selection,
  settings: Settings,
  format: Format,
): string {
  if (format === "md") return markdown(doc, selection, settings);
  if (format === "json") doc = validatedTranscript(doc);
  const segments = resolveSelection(doc, selection);
  if (format === "json")
    return (
      JSON.stringify(
        {
          ...doc,
          chapters: doc.chapters.filter((c) =>
            segments.some(
              (s) =>
                s.startMs >= c.startMs && s.startMs < (c.endMs ?? Infinity),
            ),
          ),
          segments,
          selection,
        },
        null,
        2,
      ) + "\n"
    );
  if (format === "txt") {
    const content =
      settings.preset === "archive"
        ? segments
        : paragraphs(doc, segments, settings.paragraphs === "compact");
    const meta = settings.metadata
      ? [
          doc.title,
          doc.channel,
          doc.durationMs === undefined
            ? ""
            : `Duration: ${time(doc.durationMs)}`,
          `Language: ${doc.language}`,
          `Captions: ${doc.captionType}`,
          settings.links ? doc.sourceUrl : "",
        ]
          .filter(Boolean)
          .join("\n") + "\n\n"
      : "";
    return (
      meta +
      content
        .map(
          (s) =>
            `${settings.timestamps ? `[${time(s.startMs)}] ` : ""}${s.text}`,
        )
        .join("\n\n") +
      "\n"
    );
  }
  const escapeCue = (text: string) =>
    text
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/\n\s*\n/g, "\n");
  const cues =
    segments
      .map(
        (s, i) =>
          `${i + 1}\n${time(s.startMs, true, format === "srt")} --> ${time(s.startMs + s.durationMs, true, format === "srt")}\n${escapeCue(s.text)}`,
      )
      .join("\n\n") + "\n";
  return (format === "vtt" ? "WEBVTT\n\n" : "") + cues;
}
export function filename(
  doc: Transcript,
  format: Format,
  pattern = "{{title}}",
): string {
  const raw = pattern
    .replace(
      /{{(title|videoId|channel)}}/g,
      (_, key: "title" | "videoId" | "channel") => doc[key] ?? "",
    )
    .normalize("NFC");
  let name = [...raw]
    .map((c) =>
      c.codePointAt(0)! < 32 ||
      c.codePointAt(0) === 127 ||
      /[\u202a-\u202e\u2066-\u2069]/u.test(c) ||
      /[<>:"/\\|?*]/.test(c)
        ? "-"
        : c,
    )
    .join("")
    .replace(/[. ]+$/g, "")
    .trim();
  const graphemes = new Intl.Segmenter(undefined, { granularity: "grapheme" });
  let length = 0,
    stem = "";
  for (const { segment } of graphemes.segment(name)) {
    length += [...segment].length;
    if (length > 120) break;
    stem += segment;
  }
  name = stem.replace(/[. ]+$/g, "");
  if (!name || /^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(name))
    name = `youtube-${doc.videoId}`;
  return `${name}.${format}`;
}
export const mime: Record<Format, string> = {
  md: "text/markdown",
  txt: "text/plain",
  srt: "application/x-subrip",
  vtt: "text/vtt",
  json: "application/json",
};
