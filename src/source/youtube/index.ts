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
import { withSourceTab } from "../../browser/source-tab.ts";
import { diagnostic, type ExtractionContext } from "./diagnostics.ts";
export async function discover(
  input: string,
  signal: AbortSignal,
  tabId?: number,
  workflow: ExtractionContext["workflow"] = tabId === undefined
    ? "url"
    : "current",
): Promise<Discovery> {
  const { videoId, sourceUrl } = parseUrl(input);
  const context = { videoId, workflow };
  if (tabId !== undefined) {
    try {
      const data = await playerSnapshot(tabId, videoId);
      signal.throwIfAborted();
      const found = discoveryFrom(
        data.player,
        data.initial,
        videoId,
        "active-player-v1",
      );
      diagnostic(context, "discovery", {
        tracks: found.tracks.length,
        execution: "youtube-main-frame",
      });
      return found;
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
  const found = discoveryFromHtml(
    await youtubeRequest(new URL(sourceUrl), signal),
    videoId,
  );
  diagnostic(context, "discovery", {
    tracks: found.tracks.length,
    execution: "extension-page",
  });
  return found;
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
  workflow: ExtractionContext["workflow"] = tabId === undefined
    ? "url"
    : "current",
): Promise<Transcript> {
  let track = d.tracks.find((t) => t.id === trackId);
  if (!track) throw new VextraError("CAPTION_FETCH_FAILED");
  let payload: string;
  const resource = captionUrl(track.acquisitionRef);
  const context = {
    videoId: d.videoId,
    workflow,
  };
  diagnostic(context, "retrieval", {
    tracks: d.tracks.length,
    language: track.languageCode,
    captionType: track.captionType,
    execution: "extension-page",
  });
  try {
    payload = await youtubeRequest(resource, signal, context);
  } catch (e) {
    if (!(e instanceof VextraError) || e.code !== "CAPTION_FETCH_FAILED")
      throw e;
    const refreshed = await discover(d.sourceUrl, signal, tabId, workflow);
    track = refreshed.tracks.find(
      (t) =>
        t.languageCode === track!.languageCode &&
        t.captionType === track!.captionType,
    );
    if (!track) throw new VextraError("CAPTION_FETCH_FAILED");
    payload = await youtubeRequest(captionUrl(track.acquisitionRef), signal);
  }
  signal.throwIfAborted();
  if (!payload.trim() && tabId === undefined) {
    diagnostic(context, "browser-context-fallback", { bytes: 0 });
    return withSourceTab(d.videoId, signal, async (sourceTabId) => {
      const refreshed = await discover(
        d.sourceUrl,
        signal,
        sourceTabId,
        workflow,
      );
      const selected = refreshed.tracks.find(
        (candidate) =>
          candidate.languageCode === track!.languageCode &&
          candidate.captionType === track!.captionType,
      );
      if (!selected) throw new VextraError("SELECTED_TRACK_UNAVAILABLE");
      return extract(refreshed, selected.id, signal, sourceTabId, workflow);
    }).catch((error: unknown) => {
      diagnostic(context, "browser-context-failed", {
        error: error instanceof VextraError ? error.code : "NETWORK",
      });
      throw error;
    });
  }
  let nativeUsed = false;
  let languageVerified = true;
  if (!payload.trim() && tabId !== undefined) {
    const native = await nativeTranscript(
      tabId,
      d.videoId,
      track.displayName,
      track.captionType === "automatic",
      d.tracks.filter((t) => t.displayName === track!.displayName).length === 1,
      d.tracks.length === 1,
    ).catch((error: unknown) => {
      diagnostic(context, "native-retrieval-failed", {
        error:
          error instanceof VextraError ? error.code : "PERMISSION_REQUIRED",
      });
      throw error;
    });
    payload = native.payload;
    languageVerified = native.languageVerified;
    nativeUsed = true;
    signal.throwIfAborted();
  }
  if (
    !payload.trim() &&
    captionUrl(track.acquisitionRef).searchParams.get("exp") === "xpe"
  )
    throw new VextraError("CAPTION_ACCESS_REQUIRED");
  let parsed: ReturnType<typeof parseCaptions>;
  try {
    parsed = parseCaptions(payload, d.durationMs);
  } catch (error) {
    diagnostic(context, "parsing-failed", {
      error: error instanceof VextraError ? error.code : "INVALID_CAPTIONS",
    });
    throw error;
  }
  diagnostic(context, "parsed", {
    cues: parsed.segments.length,
    bytes: new TextEncoder().encode(payload).byteLength,
    execution: nativeUsed ? "youtube-main-frame" : "extension-page",
  });
  if (nativeUsed) parsed.warnings.push("NATIVE_PANEL_TIMING");
  if (!languageVerified) parsed.warnings.push("NATIVE_LANGUAGE_UNKNOWN");
  return {
    schemaVersion: "1.0",
    documentId: crypto.randomUUID(),
    videoId: d.videoId,
    sourceUrl: d.sourceUrl,
    title: d.title,
    channel: d.channel,
    durationMs: d.durationMs,
    language: languageVerified ? track.languageCode : "und",
    captionType: languageVerified ? track.captionType : "unknown",
    trackId: track.id,
    chapters: d.chapters,
    extractedAt: new Date().toISOString(),
    ...parsed,
  };
}
