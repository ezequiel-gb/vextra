import { VextraError } from "../model/errors.ts";
import type {
  Paragraph,
  Segment,
  Selection,
  Transcript,
} from "../model/types.ts";
export function time(ms: number, millis = false, comma = false): string {
  const n = Math.max(0, Math.round(ms));
  const parts = [
    Math.floor(n / 3600000),
    Math.floor(n / 60000) % 60,
    Math.floor(n / 1000) % 60,
  ];
  return (
    parts.map((v) => String(v).padStart(2, "0")).join(":") +
    (millis ? `${comma ? "," : "."}${String(n % 1000).padStart(3, "0")}` : "")
  );
}
export function parseTime(input: string): number {
  const m = input.match(/^(?:(\d+):)?([0-5]?\d):([0-5]\d)(?:\.(\d{1,3}))?$/);
  if (!m) throw new VextraError("INVALID_SELECTION");
  return (
    (Number(m[1] ?? 0) * 3600 + Number(m[2]) * 60 + Number(m[3])) * 1000 +
    Number((m[4] ?? "").padEnd(3, "0"))
  );
}
export function resolveSelection(
  doc: Transcript,
  selection: Selection,
): Segment[] {
  let result: Segment[];
  if (selection.kind === "all") result = [...doc.segments];
  else if (selection.kind === "passages") {
    const ids = new Set(selection.segmentIds);
    result = doc.segments.filter((s) => ids.has(s.id));
  } else if (selection.kind === "chapters") {
    const ids = new Set(selection.chapterIds),
      chapters = doc.chapters.filter((c) => ids.has(c.id));
    result = doc.segments.filter((s) =>
      chapters.some(
        (c) => s.startMs >= c.startMs && s.startMs < (c.endMs ?? Infinity),
      ),
    );
  } else {
    const { startMs: a, endMs: b } = selection;
    if (
      !Number.isFinite(a) ||
      !Number.isFinite(b) ||
      a < 0 ||
      b <= a ||
      (doc.durationMs !== undefined && b > doc.durationMs)
    )
      throw new VextraError("INVALID_SELECTION");
    result = doc.segments.filter((s) => s.startMs >= a && s.startMs < b);
  }
  if (!result.length) throw new VextraError("INVALID_SELECTION");
  return result;
}
function joinText(a: string, b: string): string {
  const noSpace =
    /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}]$/u.test(a) &&
    /^[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}]/u.test(b);
  return a + (a && !noSpace ? " " : "") + b;
}
export function paragraphs(
  doc: Transcript,
  segments: readonly Segment[] = doc.segments,
  compact = false,
): Paragraph[] {
  const output: Paragraph[] = [],
    indices = new Map(doc.segments.map((s, i) => [s.id, i]));
  let current: Paragraph | undefined, previous: Segment | undefined;
  for (const s of segments) {
    const chapter = doc.chapters.findLast((c) => s.startMs >= c.startMs)?.id;
    const duplicate =
      previous &&
      previous.startMs === s.startMs &&
      previous.durationMs === s.durationMs &&
      previous.text === s.text;
    if (duplicate) {
      current?.segmentIds.push(s.id);
      previous = s;
      continue;
    }
    const discontinuous =
      previous && indices.get(s.id)! !== indices.get(previous.id)! + 1;
    const split =
      !current ||
      chapter !== current.chapterId ||
      discontinuous ||
      (previous &&
        s.startMs - (previous.startMs + previous.durationMs) >= 2000) ||
      (current.text.length >= (compact ? 250 : 450) &&
        /[.!?。！？]$/.test(current.text)) ||
      current.text.length + s.text.length > 1200;
    if (split) {
      current = {
        segmentIds: [],
        startMs: s.startMs,
        endMs: s.startMs + s.durationMs,
        text: "",
        chapterId: chapter,
      };
      output.push(current);
    }
    current!.text = joinText(current!.text, s.text);
    current!.segmentIds.push(s.id);
    current!.endMs = Math.max(current!.endMs, s.startMs + s.durationMs);
    previous = s;
  }
  return output;
}
export interface SearchMatch {
  start: number;
  end: number;
  segmentId: string;
}
export function searchIndex(segments: readonly Segment[]): {
  text: string;
  starts: Map<string, number>;
} {
  const parts: string[] = [],
    starts = new Map<string, number>();
  let count = 0,
    previous = "";
  for (const s of segments) {
    const separator =
      parts.length &&
      joinText(previous, s.text).length > previous.length + s.text.length
        ? " "
        : "";
    if (separator) {
      parts.push(separator);
      count++;
    }
    starts.set(s.id, count);
    parts.push(s.text);
    count += s.text.length;
    previous = s.text;
  }
  return { text: parts.join(""), starts };
}
export function searchDocument(
  segments: readonly Segment[],
  query: string,
): SearchMatch[] {
  if (!query.trim()) return [];
  const index = searchIndex(segments),
    joined = index.text,
    text = joined.toLowerCase(),
    q = query.toLowerCase(),
    found: SearchMatch[] = [];
  const graphemes = new Intl.Segmenter(undefined, {
    granularity: "grapheme",
  }).segment(joined);
  const offsets: number[] = [],
    ends: number[] = [];
  // Most Unicode case folds preserve UTF-16 length: avoid building an index per
  // character in that common path. Expanding folds retain an exact source map.
  if (text.length !== joined.length)
    for (const { segment, index } of graphemes) {
      const value = segment.toLowerCase();
      for (let n = 0; n < value.length; n++) {
        offsets.push(index);
        ends.push(index + segment.length);
      }
    }
  const starts = segments.map((s) => index.starts.get(s.id)!);
  let pos = 0,
    cue = 0;
  while ((pos = text.indexOf(q, pos)) !== -1) {
    const first = graphemes.containing(pos),
      last = graphemes.containing(pos + q.length - 1);
    const start = offsets.length ? offsets[pos]! : (first?.index ?? pos);
    const end = ends.length
      ? ends[pos + q.length - 1]!
      : last
        ? last.index + last.segment.length
        : pos + q.length;
    while (cue + 1 < starts.length && starts[cue + 1]! <= start) cue++;
    found.push({ start, end, segmentId: segments[cue]!.id });
    pos += Math.max(1, q.length);
  }
  return found;
}
