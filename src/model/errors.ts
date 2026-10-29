const messages: Record<string, string> = {
  SELECTED_TRACK_UNAVAILABLE: "The selected caption track is no longer available. Refresh the caption languages and select another track.",
  NATIVE_FILTER_ACTIVE:
    "Clear the search in YouTube’s transcript panel, then retry Vextra to extract the full transcript.",
  NATIVE_TRANSCRIPT_UNAVAILABLE:
    "YouTube did not expose a complete timed transcript. Retry, select another caption track or check access to the video.",
  NATIVE_LANGUAGE_UNVERIFIED:
    "Vextra could not verify the selected language in YouTube’s transcript panel. Select the same language there, then retry.",
  INVALID_URL: "Enter a supported YouTube video link.",
  UNSUPPORTED_PAGE: "Open a YouTube video or use From URL.",
  PERMISSION_REQUIRED:
    "YouTube access is unavailable. Check Vextra’s site permissions in your browser’s extension settings.",
  DISCOVERY_CHANGED:
    "YouTube’s video information could not be recognised. Refresh the video information and retry.",
  NO_CAPTION_TRACKS: "No accessible caption tracks were found for this video.",
  ACCESS_RESTRICTED:
    "YouTube requires access that Vextra cannot provide for this video.",
  VIDEO_UNAVAILABLE: "This video is unavailable.",
  CONSENT_REQUIRED:
    "YouTube returned a consent page. Open YouTube normally to review it, then retry.",
  REQUEST_BLOCKED:
    "YouTube blocked this request or requires a browser verification. Try again later.",
  CAPTION_FETCH_FAILED:
    "The caption track could not be retrieved. Retry to refresh its video information.",
  CAPTION_ACCESS_REQUIRED:
    "YouTube did not provide caption content for this track. Retry or select another caption language.",
  RATE_LIMITED: "YouTube is limiting requests. Wait before retrying.",
  NETWORK: "The network request failed. Check your connection and retry.",
  TIMEOUT: "The request timed out. Retry when the connection is available.",
  INVALID_CAPTIONS: "The caption response could not be parsed safely.",
  UNSUPPORTED_CAPTION_FORMAT: "YouTube returned an unsupported caption format.",
  EMPTY_TRANSCRIPT: "No usable captions with timestamps were returned.",
  INVALID_SELECTION:
    "Select at least one passage or chapter, or enter a time range that contains captions.",
  CANCELLED: "Cancelled. Completed results are preserved.",
  BUSY: "Another Vextra window is processing. Wait for it to finish or resume after interruption.",
  STORAGE_FULL:
    "Local storage is full. Export your work and clear temporary transcript data.",
  EXPORT_FAILED:
    "The export could not be created. Your transcript is still available.",
  DOWNLOAD_INTERRUPTED: "The download was interrupted. Try downloading again.",
  RESPONSE_SIZE_LIMIT:
    "YouTube’s response exceeds 25 MiB. Try a shorter video or another caption track.",
  CAPTION_SIZE_LIMIT:
    "The caption data exceeds 25 MiB. Try a shorter video or another caption track.",
  CAPTION_CUE_LIMIT:
    "The transcript exceeds 300,000 caption cues. Try a shorter video or another caption track.",
  CAPTION_MARKUP_LIMIT:
    "A caption cue contains more than 1,000 markup elements. Select another caption track.",
  NATIVE_CUE_LIMIT:
    "YouTube’s transcript panel exceeds 100,000 entries. Try another caption track or a shorter video.",
  NATIVE_SIZE_LIMIT:
    "YouTube’s transcript panel data exceeds 3 MiB. Try another caption track or a shorter video.",
  BATCH_INPUT_LIMIT:
    "The URL list exceeds 100,000 characters. Split it into smaller batches.",
  BATCH_VIDEO_LIMIT:
    "A batch supports up to 100 unique videos. Split this list into smaller batches.",
  EXPORT_SIZE_LIMIT:
    "The generated export exceeds 100 MiB. Select fewer passages, simplify the template or download videos individually.",
  TEMPLATE_SIZE_LIMIT:
    "A template supports up to 50 KiB of UTF-8 text. Shorten the template and save it again.",
  INVALID_TEMPLATE:
    "Use only the listed template placeholders, enclosed in matching double braces.",
};
export class VextraError extends Error {
  code: string;
  retryAfterMs?: number;
  constructor(code: string, retryAfterMs?: number) {
    super(messages[code] ?? code);
    this.name = "VextraError";
    this.code = code;
    this.retryAfterMs = retryAfterMs;
  }
}
export const errorText = (e: unknown): string =>
  e instanceof VextraError
    ? e.message
    : e instanceof DOMException && e.name === "AbortError"
      ? messages.CANCELLED!
      : e instanceof DOMException && e.name === "TimeoutError"
        ? messages.TIMEOUT!
        : "The operation failed. Your existing transcript is preserved. Retry or choose another format.";

export function captionWarningText(code: string): string {
  if (code === "NATIVE_LANGUAGE_UNKNOWN")
    return "Extracted the transcript currently shown in YouTube’s panel. Its language and caption type could not be verified, so your selected caption language has not been assigned. Check the text before exporting.";
  if (code === "TIMING_INFERRED")
    return "Some caption durations were inferred from the next cue or video duration.";
  if (code === "CUES_REORDERED")
    return "Caption cues were sorted by their source timestamps.";
  if (code === "NATIVE_PANEL_TIMING")
    return "Captions were read from YouTube’s transcript panel; its timestamps may be rounded.";
  const skipped = /^INVALID_CUES_SKIPPED:(\d+)$/.exec(code);
  return skipped
    ? `${skipped[1]} invalid caption cues were omitted.`
    : "The source captions include an additional processing note.";
}
export const object = (v: unknown): Record<string, unknown> =>
  typeof v === "object" && v !== null && !Array.isArray(v)
    ? (v as Record<string, unknown>)
    : {};
export const array = (v: unknown): unknown[] => (Array.isArray(v) ? v : []);
export const string = (v: unknown): string | undefined =>
  typeof v === "string" ? v : undefined;
export const textValue = (v: unknown): string =>
  string(object(v).simpleText) ??
  array(object(v).runs)
    .map((r) => string(object(r).text) ?? "")
    .join("");
