import { object, VextraError } from "../model/errors.ts";

/** Own one background page for this operation; disconnecting cancels its lifetime. */
export async function withSourceTab<T>(
  videoId: string,
  signal: AbortSignal,
  operation: (tabId: number) => Promise<T>,
): Promise<T> {
  signal.throwIfAborted();
  const port = chrome.runtime.connect({ name: "vextra-source-v1" });
  let settled = false;
  let rejectReady: (error: Error) => void = () => undefined;
  const cancelled = () =>
    new VextraError(
      signal.reason instanceof DOMException &&
        signal.reason.name === "TimeoutError"
        ? "TIMEOUT"
        : "CANCELLED",
    );
  const abort = () => {
    rejectReady(cancelled());
    port.disconnect();
  };
  signal.addEventListener("abort", abort, { once: true });
  try {
    const tabId = await new Promise<number>((resolve, reject) => {
      rejectReady = reject;
      port.onMessage.addListener((raw: unknown) => {
        const m = object(raw);
        if (m.error) {
          rejectReady(
            new VextraError(
              m.error === "BUSY"
                ? "BUSY"
                : m.error === "TIMEOUT"
                  ? "TIMEOUT"
                  : "PERMISSION_REQUIRED",
            ),
          );
          return;
        }
        if (settled) return;
        settled = true;
        if (Number.isSafeInteger(m.tabId) && Number(m.tabId) >= 0)
          resolve(Number(m.tabId));
        else
          reject(
            new VextraError(
              m.error === "BUSY"
                ? "BUSY"
                : m.error === "TIMEOUT"
                  ? "TIMEOUT"
                  : "PERMISSION_REQUIRED",
            ),
          );
      });
      port.onDisconnect.addListener(() => {
        // Reading lastError prevents Chrome logging a closed-port diagnostic.
        void chrome.runtime.lastError;
        rejectReady(
          signal.aborted ? cancelled() : new VextraError("PERMISSION_REQUIRED"),
        );
      });
      port.postMessage({ videoId });
    });
    signal.throwIfAborted();
    // Racing cancellation also covers a pending scripting response.
    return await Promise.race([
      operation(tabId),
      new Promise<never>((_resolve, reject) => {
        rejectReady = reject;
        if (signal.aborted) reject(cancelled());
      }),
    ]);
  } finally {
    signal.removeEventListener("abort", abort);
    port.disconnect();
  }
}
