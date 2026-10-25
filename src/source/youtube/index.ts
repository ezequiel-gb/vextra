import type {
  Discovery,
  Settings,
  Track,
  Transcript,
} from "../../model/types.ts";
import { VextraError } from "../../model/errors.ts";
import { discoveryFrom, discoveryFromHtml } from "./discovery.ts";
import { captionUrl, parseUrl } from "./urls.ts";
import { youtubeRequest } from "./request.ts";
import { playerSnapshot, nativeTranscript } from "../../browser/platform.ts";
import { parseCaptions } from "../../processing/captions.ts";
export async function discover(
  input: string,
  signal: AbortSignal,
  tabId?: number,
): Promise<Discovery> {
  const { videoId, sourceUrl } = parseUrl(input);
  if (tabId !== undefined) {
    try {
      const data = await playerSnapshot(tabId, videoId);
      signal.throwIfAborted();
      return discoveryFrom(
        data.player,
        data.initial,
        videoId,
        "active-player-v1",
      );
    } catch (e) {
      if (signal.aborted) throw new VextraError("CANCELLED");
      if (
        e instanceof VextraError &&
        [
          "NO_CAPTION_TRACKS",
          "ACCESS_RESTRICTED",
          "VIDEO_UNAVAILABLE",
        ].includes(e.code)
      )
        throw e;
    }
  }
  return discoveryFromHtml(
    await youtubeRequest(new URL(sourceUrl), signal),
    videoId,
  );
}
export function chooseTrack(
  d: Discovery,
  settings: Pick<Settings, "language" | "captionType">,
): Track {
  const exact = d.tracks.filter(
    (t) => t.languageCode.toLowerCase() === settings.language.toLowerCase(),
  );
  const base = d.tracks.filter(
    (t) => t.languageCode.split("-")[0] === settings.language.split("-")[0],
  );
  const candidates = exact.length ? exact : base.length ? base : d.tracks;
  const track =
    candidates.find((t) => t.captionType === settings.captionType) ??
    candidates.find((t) => t.captionType === "manual") ??
    candidates[0];
  if (!track) throw new VextraError("NO_CAPTION_TRACKS");
  return track;
}
export async function extract(
  d: Discovery,
  trackId: string,
  signal: AbortSignal,
  tabId?: number,
): Promise<Transcript> {
  let track = d.tracks.find((t) => t.id === trackId);
  if (!track) throw new VextraError("CAPTION_FETCH_FAILED");
  let payload: string;
  try {
    payload = await youtubeRequest(captionUrl(track.acquisitionRef), signal);
  } catch (e) {
    if (!(e instanceof VextraError) || e.code !== "CAPTION_FETCH_FAILED")
      throw e;
    const refreshed = await discover(d.sourceUrl, signal, tabId);
    track = refreshed.tracks.find(
      (t) =>
        t.languageCode === track!.languageCode &&
        t.captionType === track!.captionType,
    );
    if (!track) throw new VextraError("CAPTION_FETCH_FAILED");
    payload = await youtubeRequest(captionUrl(track.acquisitionRef), signal);
  }
  signal.throwIfAborted();
  let nativeUsed = false;
  if (!payload.trim() && tabId !== undefined) {
    payload = await nativeTranscript(
      tabId,
      d.videoId,
      track.displayName,
      track.captionType === "automatic",
      d.tracks.filter((t) => t.displayName === track!.displayName).length === 1,
    );
    nativeUsed = true;
    signal.throwIfAborted();
  }
  if (
    !payload.trim() &&
    captionUrl(track.acquisitionRef).searchParams.get("exp") === "xpe"
  )
    throw new VextraError("CAPTION_ACCESS_REQUIRED");
  const parsed = parseCaptions(payload, d.durationMs);
  if (nativeUsed) parsed.warnings.push("NATIVE_PANEL_TIMING");
  return {
    schemaVersion: "1.0",
    documentId: crypto.randomUUID(),
    videoId: d.videoId,
    sourceUrl: d.sourceUrl,
    title: d.title,
    channel: d.channel,
    durationMs: d.durationMs,
    language: track.languageCode,
    captionType: track.captionType,
    trackId: track.id,
    chapters: d.chapters,
    extractedAt: new Date().toISOString(),
    ...parsed,
  };
}
