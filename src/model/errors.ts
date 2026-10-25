const messages: Record<string, string> = {
  NATIVE_TRANSCRIPT_UNAVAILABLE:
    "YouTube’s transcript panel did not provide timed entries. Open its Transcript tab to check availability, then retry Vextra.",
  NATIVE_LANGUAGE_UNVERIFIED:
    "Vextra could not verify the selected language in YouTube’s transcript panel. Select the same language there, then retry.",
  INVALID_URL: "Enter a supported YouTube video link.",
  UNSUPPORTED_PAGE: "Open a YouTube video or use From URL.",
  PERMISSION_REQUIRED:
    "YouTube access is unavailable. Check Vextra’s site permissions in your browser’s extension settings.",
  DISCOVERY_CHANGED:
    "YouTube’s video information could not be recognized. No transcript was extracted.",
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
    "YouTube returned an empty caption response. Vextra’s current extraction method could not retrieve this track.",
  RATE_LIMITED: "YouTube is limiting requests. Wait before retrying.",
  NETWORK: "The network request failed. Check your connection and retry.",
  TIMEOUT: "The request timed out. Retry when the connection is available.",
  INVALID_CAPTIONS: "The caption response could not be parsed safely.",
  UNSUPPORTED_CAPTION_FORMAT: "YouTube returned an unsupported caption format.",
  EMPTY_TRANSCRIPT: "No nonempty timed captions were returned.",
  INVALID_SELECTION:
    "Select at least one passage or chapter, or enter a valid nonempty time range.",
  CANCELLED: "Cancelled. Completed results are preserved.",
  BUSY: "Another Vextra window is processing. Wait for it to finish or resume after interruption.",
  STORAGE_FULL:
    "Local storage is full. Export your work and clear temporary transcript data.",
  EXPORT_FAILED:
    "The export could not be created. Your transcript is still available.",
  DOWNLOAD_INTERRUPTED: "The download was interrupted. Try downloading again.",
  LIMIT: "This input exceeds Vextra’s safety limit.",
  INVALID_TEMPLATE:
    "The template contains an unsupported placeholder or exceeds the local limit.",
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
