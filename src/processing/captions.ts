import type { Segment } from "../model/types.ts";
import { array, object, string, VextraError } from "../model/errors.ts";
import { limits } from "../model/limits.ts";

interface RawCue {
  startMs: number;
  durationMs?: number;
  text: string;
}
export function parseCaptions(
  payload: string,
  durationMs?: number,
): { segments: Segment[]; warnings: string[] } {
  if (
    payload.length > limits.responseBytes ||
    new TextEncoder().encode(payload).byteLength > limits.responseBytes
  )
    throw new VextraError("CAPTION_SIZE_LIMIT");
  const raw: RawCue[] = [];
  const warnings: string[] = [];
  let skipped = 0;
  try {
    if (payload.trimStart().startsWith("{")) {
      const root = object(JSON.parse(payload));
      if (!Array.isArray(root.events))
        throw new VextraError("UNSUPPORTED_CAPTION_FORMAT");
      if (root.events.length > limits.captionCues)
        throw new VextraError("CAPTION_CUE_LIMIT");
      for (const event of array(root.events)) {
        const e = object(event);
        const text = array(e.segs)
          .map((s) => string(object(s).utf8) ?? "")
          .join("");
        if (text.trim())
          raw.push({
            startMs: Number(e.tStartMs),
            durationMs:
              e.dDurationMs === undefined ? undefined : Number(e.dDurationMs),
            text,
          });
      }
    } else if (payload.trimStart().startsWith("<")) {
      if (/<!DOCTYPE|<!ENTITY/i.test(payload))
        throw new VextraError("INVALID_CAPTIONS");
      const xml = new DOMParser().parseFromString(payload, "text/xml");
      if (
        xml.querySelector("parsererror") ||
        /^(html)$/i.test(xml.documentElement.tagName)
      )
        throw new VextraError("INVALID_CAPTIONS");
      const tag = xml.documentElement.tagName;
      if (!["transcript", "timedtext"].includes(tag))
        throw new VextraError("UNSUPPORTED_CAPTION_FORMAT");
      const nodes = Array.from(
        xml.querySelectorAll(tag === "transcript" ? "text" : "body > p"),
      );
      if (nodes.length > limits.captionCues)
        throw new VextraError("CAPTION_CUE_LIMIT");
      for (const node of nodes) {
        if (node.querySelectorAll("*").length > 1000)
          throw new VextraError("CAPTION_MARKUP_LIMIT");
        node.querySelectorAll("br").forEach((br) => br.replaceWith("\n"));
        const seconds = tag === "transcript",
          start = node.getAttribute(seconds ? "start" : "t"),
          d = node.getAttribute(seconds ? "dur" : "d");
        raw.push({
          startMs: start === null ? NaN : Number(start) * (seconds ? 1000 : 1),
          durationMs: d === null ? undefined : Number(d) * (seconds ? 1000 : 1),
          text: node.textContent ?? "",
        });
      }
    } else if (!payload.trim()) throw new VextraError("EMPTY_TRANSCRIPT");
    else throw new VextraError("UNSUPPORTED_CAPTION_FORMAT");
  } catch (e) {
    if (e instanceof VextraError) throw e;
    throw new VextraError("INVALID_CAPTIONS");
  }
  const valid = raw.filter((c) => {
    const ok =
      Number.isSafeInteger(Math.round(c.startMs)) &&
      c.startMs >= 0 &&
      (c.durationMs === undefined ||
        (Number.isSafeInteger(Math.round(c.durationMs)) &&
          c.durationMs > 0 &&
          Number.isSafeInteger(
            Math.round(c.startMs) + Math.round(c.durationMs),
          ))) &&
      c.text.trim().length > 0;
    if (!ok) skipped++;
    return ok;
  });
  if (valid.some((c, i) => i > 0 && c.startMs < valid[i - 1]!.startMs))
    warnings.push("CUES_REORDERED");
  valid.sort((a, b) => a.startMs - b.startMs);
  const segments = valid.map((c, i): Segment => {
    const startMs = Math.round(c.startMs),
      inferred = c.durationMs === undefined;
    const end = valid[i + 1]?.startMs ?? durationMs ?? startMs + 1000;
    const cueDuration = Math.max(
      1,
      Math.round(c.durationMs ?? (end > startMs ? end - startMs : 1000)),
    );
    if (
      !Number.isSafeInteger(cueDuration) ||
      !Number.isSafeInteger(startMs + cueDuration)
    )
      throw new VextraError("INVALID_CAPTIONS");
    if (inferred && !warnings.includes("TIMING_INFERRED"))
      warnings.push("TIMING_INFERRED");
    return {
      id: `cue-${i}`,
      startMs,
      durationMs: cueDuration,
      text: c.text
        .replace(/\r\n?/g, "\n")
        .split("\n")
        .map((l) => l.replace(/[\t ]+/g, " ").trim())
        .join("\n")
        .trim(),
      ...(inferred ? { timingInferred: true } : {}),
    };
  });
  if (skipped) warnings.push(`INVALID_CUES_SKIPPED:${skipped}`);
  if (!segments.length) throw new VextraError("EMPTY_TRANSCRIPT");
  return { segments, warnings: [...new Set(warnings)] };
}
