import type { Transcript } from "./types.ts";
import { object, string, array, VextraError } from "./errors.ts";
/** Revalidate persisted records; storage is data, not a trusted TypeScript producer. */
export function validatedTranscript(raw: unknown): Transcript {
  const r = object(raw),
    id = string(r.videoId);
  if (
    r.schemaVersion !== "1.0" ||
    !id ||
    !/^[\w-]{11}$/.test(id) ||
    r.sourceUrl !== `https://www.youtube.com/watch?v=${id}` ||
    typeof r.documentId !== "string" ||
    typeof r.language !== "string" ||
    !["manual", "automatic", "unknown"].includes(String(r.captionType)) ||
    typeof r.trackId !== "string" ||
    !Number.isFinite(Date.parse(String(r.extractedAt))) ||
    !Array.isArray(r.segments) ||
    r.segments.length === 0 ||
    r.segments.length > 300000
  )
    throw new VextraError("INVALID_CAPTIONS");
  const segments = array(r.segments).map((v) => {
    const s = object(v);
    if (
      typeof s.id !== "string" ||
      typeof s.text !== "string" ||
      !s.text.trim() ||
      !Number.isSafeInteger(s.startMs) ||
      Number(s.startMs) < 0 ||
      !Number.isSafeInteger(s.durationMs) ||
      Number(s.durationMs) <= 0
    )
      throw new VextraError("INVALID_CAPTIONS");
    return {
      id: s.id,
      text: s.text,
      startMs: Number(s.startMs),
      durationMs: Number(s.durationMs),
      ...(s.timingInferred === true ? { timingInferred: true } : {}),
    };
  });
  if (
    segments.some((s, i) => i > 0 && s.startMs < segments[i - 1]!.startMs) ||
    new Set(segments.map((s) => s.id)).size !== segments.length
  )
    throw new VextraError("INVALID_CAPTIONS");
  const chapters = array(r.chapters).map((v) => {
    const c = object(v);
    if (
      typeof c.id !== "string" ||
      typeof c.title !== "string" ||
      c.provenance !== "youtube-chapter-metadata" ||
      !Number.isSafeInteger(c.startMs) ||
      Number(c.startMs) < 0 ||
      (c.endMs !== undefined &&
        (!Number.isSafeInteger(c.endMs) ||
          Number(c.endMs) <= Number(c.startMs)))
    )
      throw new VextraError("INVALID_CAPTIONS");
    return {
      id: c.id,
      title: c.title,
      startMs: Number(c.startMs),
      endMs: c.endMs === undefined ? undefined : Number(c.endMs),
      provenance: "youtube-chapter-metadata" as const,
    };
  });
  return {
    schemaVersion: "1.0",
    documentId: r.documentId,
    videoId: id,
    sourceUrl: r.sourceUrl,
    title: string(r.title),
    channel: string(r.channel),
    durationMs:
      typeof r.durationMs === "number" &&
      r.durationMs > 0 &&
      Number.isFinite(r.durationMs)
        ? r.durationMs
        : undefined,
    language: r.language,
    captionType: r.captionType as Transcript["captionType"],
    trackId: r.trackId,
    segments,
    chapters,
    extractedAt: String(r.extractedAt),
    warnings: array(r.warnings).filter(
      (w): w is string => typeof w === "string",
    ),
  };
}
