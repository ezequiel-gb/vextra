import {
  array,
  object,
  string,
  textValue,
  VextraError,
} from "../../model/errors.ts";
import type { Chapter, Discovery, Track } from "../../model/types.ts";
import { captionUrl } from "./urls.ts";

/** Read embedded JSON without executing page script, respecting quoted braces. */
export function embeddedJson(html: string, marker: string): unknown {
  let from = html.indexOf(marker);
  if (from < 0) return undefined;
  from = html.indexOf("{", from + marker.length);
  if (from < 0 || from > html.indexOf(marker) + marker.length + 30)
    return undefined;
  let depth = 0,
    quoted = false,
    escaped = false;
  for (let i = from; i < html.length; i++) {
    const c = html[i];
    if (quoted) {
      if (escaped) escaped = false;
      else if (c === "\\") escaped = true;
      else if (c === '"') quoted = false;
    } else if (c === '"') quoted = true;
    else if (c === "{") {
      if (++depth > 200) throw new VextraError("DISCOVERY_CHANGED");
    } else if (c === "}" && --depth === 0) {
      try {
        return JSON.parse(html.slice(from, i + 1));
      } catch {
        return undefined;
      }
    }
  }
  return undefined;
}

function chaptersFrom(initial: unknown, duration?: number): Chapter[] {
  // Only explicit chapterRenderer records count as genuine metadata.
  const chapters: Chapter[] = [];
  let visited = 0;
  const visit = (v: unknown, depth: number) => {
    if (depth > 45 || ++visited > 100_000) return;
    if (Array.isArray(v)) {
      v.forEach((x) => visit(x, depth + 1));
      return;
    }
    const r = object(v),
      c = object(r.chapterRenderer);
    const start = Number(c.timeRangeStartMillis),
      title = textValue(c.title);
    if (title && Number.isFinite(start) && start >= 0)
      chapters.push({
        id: `chapter-${start}`,
        title,
        startMs: start,
        provenance: "youtube-chapter-metadata",
      });
    Object.values(r).forEach((x) => {
      if (x && typeof x === "object") visit(x, depth + 1);
    });
  };
  visit(initial, 0);
  const sorted = [
    ...new Map(chapters.map((c) => [c.startMs, c])).values(),
  ].sort((a, b) => a.startMs - b.startMs);
  return sorted
    .filter((c) => duration === undefined || c.startMs < duration)
    .map((c, i) => ({ ...c, endMs: sorted[i + 1]?.startMs ?? duration }));
}

export function discoveryFrom(
  player: unknown,
  initial: unknown,
  videoId: string,
  adapterId: string,
): Discovery {
  const p = object(player),
    details = object(p.videoDetails),
    status = object(p.playabilityStatus);
  const reason = textValue(status.reason) || string(status.reason) || "";
  if (/bot|unusual traffic/i.test(reason))
    throw new VextraError("REQUEST_BLOCKED");
  if (
    status.status === "LOGIN_REQUIRED" ||
    status.status === "AGE_CHECK_REQUIRED"
  )
    throw new VextraError("ACCESS_RESTRICTED");
  if (status.status && status.status !== "OK")
    throw new VextraError("VIDEO_UNAVAILABLE");
  if (details.videoId !== videoId) throw new VextraError("DISCOVERY_CHANGED");
  const renderer = object(object(p.captions).playerCaptionsTracklistRenderer);
  const tracks: Track[] = array(renderer.captionTracks).flatMap((raw, i) => {
    const t = object(raw),
      url = string(t.baseUrl),
      code = string(t.languageCode);
    if (!url || !code) return [];
    try {
      captionUrl(url);
    } catch {
      return [];
    }
    return [
      {
        id: `${code}-${i}`,
        languageCode: code,
        displayName: textValue(t.name) || code,
        captionType: t.kind === "asr" ? "automatic" : "manual",
        acquisitionRef: url,
      },
    ];
  });
  if (!tracks.length) throw new VextraError("NO_CAPTION_TRACKS");
  const duration = Number(details.lengthSeconds) * 1000;
  const durationMs =
    Number.isFinite(duration) && duration > 0 ? duration : undefined;
  const thumbs = array(object(details.thumbnail).thumbnails);
  const thumb = string(object(thumbs.at(-1)).url);
  return {
    videoId,
    sourceUrl: `https://www.youtube.com/watch?v=${videoId}`,
    title: string(details.title),
    channel: string(details.author),
    durationMs,
    thumbnailUrl: thumb?.startsWith("https://i.ytimg.com/") ? thumb : undefined,
    tracks,
    chapters: chaptersFrom(initial, durationMs),
    adapterId,
  };
}

export function discoveryFromHtml(html: string, videoId: string): Discovery {
  if (/action="https:\/\/consent\.youtube\.com|consent-bump/i.test(html))
    throw new VextraError("CONSENT_REQUIRED");
  const player =
    embeddedJson(html, "var ytInitialPlayerResponse =") ??
    embeddedJson(html, "ytInitialPlayerResponse =") ??
    embeddedJson(html, 'ytInitialPlayerResponse":');
  if (!player && /unusual traffic|confirm you.re not a bot/i.test(html))
    throw new VextraError("REQUEST_BLOCKED");
  return discoveryFrom(
    player,
    embeddedJson(html, "var ytInitialData ="),
    videoId,
    "public-watch-v1",
  );
}
