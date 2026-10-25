import { VextraError } from "../../model/errors.ts";
import { hosts } from "./urls.ts";

export async function youtubeRequest(
  url: URL,
  signal: AbortSignal,
): Promise<string> {
  if (
    url.protocol !== "https:" ||
    !hosts.has(url.hostname) ||
    url.port ||
    url.username ||
    url.password ||
    !["/watch", "/api/timedtext"].includes(url.pathname)
  )
    throw new VextraError("CAPTION_FETCH_FAILED");
  const timeout = AbortSignal.timeout(20_000);
  try {
    const response = await fetch(url, {
      credentials: "omit",
      redirect: "error",
      signal: AbortSignal.any([signal, timeout]),
    });
    if (response.status === 429) {
      const h = response.headers.get("retry-after");
      const sec = Number(h);
      throw new VextraError(
        "RATE_LIMITED",
        h
          ? Number.isFinite(sec)
            ? sec * 1000
            : Math.max(0, Date.parse(h) - Date.now())
          : undefined,
      );
    }
    if (response.status === 403) throw new VextraError("CAPTION_FETCH_FAILED");
    if (!response.ok)
      throw new VextraError(
        response.status >= 500 ? "NETWORK" : "VIDEO_UNAVAILABLE",
      );
    if (Number(response.headers.get("content-length")) > 25 * 1024 * 1024)
      throw new VextraError("LIMIT");
    const reader = response.body?.getReader();
    if (!reader) throw new VextraError("NETWORK");
    const decoder = new TextDecoder();
    let total = 0,
      text = "";
    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        total += value.byteLength;
        if (total > 25 * 1024 * 1024) throw new VextraError("LIMIT");
        text += decoder.decode(value, { stream: true });
      }
      return text + decoder.decode();
    } finally {
      await reader.cancel().catch(() => undefined);
    }
  } catch (e) {
    if (signal.aborted)
      throw new VextraError(
        signal.reason instanceof DOMException &&
          signal.reason.name === "TimeoutError"
          ? "TIMEOUT"
          : "CANCELLED",
      );
    if (timeout.aborted) throw new VextraError("TIMEOUT");
    if (e instanceof VextraError) throw e;
    throw new VextraError("NETWORK");
  }
}
