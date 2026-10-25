import { object, VextraError } from "../model/errors.ts";
import { parseUrl } from "../source/youtube/urls.ts";
export async function activeVideo() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab?.id || !tab.url) throw new VextraError("UNSUPPORTED_PAGE");
  try {
    return { ...parseUrl(tab.url), tabId: tab.id };
  } catch {
    throw new VextraError("UNSUPPORTED_PAGE");
  }
}
export async function playerSnapshot(
  tabId: number,
  videoId: string,
): Promise<{ player: unknown; initial: unknown }> {
  const requestId = crypto.randomUUID();
  const r = object(
    await chrome.runtime.sendMessage({
      protocolVersion: 1,
      requestId,
      type: "READ_PLAYER",
      tabId,
      videoId,
    }),
  );
  if (r.requestId !== requestId || r.protocolVersion !== 1 || r.error)
    throw new VextraError("PERMISSION_REQUIRED");
  const data = object(r.data);
  return { player: data.player, initial: data.initial };
}
export async function openExpanded() {
  await chrome.tabs.create({ url: chrome.runtime.getURL("panel.html") });
}
export async function nativeTranscript(
  tabId: number,
  videoId: string,
  label: string,
  automatic: boolean,
  uniqueLabel: boolean,
): Promise<string> {
  const requestId = crypto.randomUUID();
  const response = object(
    await chrome.runtime.sendMessage({
      protocolVersion: 1,
      requestId,
      type: "READ_NATIVE_TRANSCRIPT",
      tabId,
      videoId,
      label,
      automatic,
      uniqueLabel,
    }),
  );
  if (
    response.requestId !== requestId ||
    response.protocolVersion !== 1 ||
    response.error
  )
    throw new VextraError("PERMISSION_REQUIRED");
  const data = object(response.data);
  if (typeof data.error === "string")
    throw new VextraError(
      [
        "CONSENT_REQUIRED",
        "LIMIT",
        "UNSUPPORTED_PAGE",
        "NATIVE_LANGUAGE_UNVERIFIED",
      ].includes(data.error)
        ? data.error
        : "NATIVE_TRANSCRIPT_UNAVAILABLE",
    );
  if (typeof data.payload !== "string" || data.payload.length > 3 * 1024 * 1024)
    throw new VextraError("NATIVE_TRANSCRIPT_UNAVAILABLE");
  return data.payload;
}
export async function downloadBlob(
  blob: Blob,
  filename: string,
): Promise<void> {
  const url = URL.createObjectURL(blob);
  try {
    const id = await chrome.downloads.download({
      url,
      filename,
      conflictAction: "uniquify",
      saveAs: false,
    });
    await new Promise<void>((resolve, reject) => {
      const finish = (failed = false) => {
        clearTimeout(timer);
        chrome.downloads.onChanged.removeListener(onChanged);
        if (failed) reject(new VextraError("DOWNLOAD_INTERRUPTED"));
        else resolve();
      };
      const onChanged = (d: chrome.downloads.DownloadDelta) => {
        if (d.id === id && d.state?.current === "complete") finish();
        if (d.id === id && (d.error || d.state?.current === "interrupted"))
          finish(true);
      };
      const timer = setTimeout(() => finish(true), 300_000);
      chrome.downloads.onChanged.addListener(onChanged);
      void chrome.downloads.search({ id }).then(
        (items) => {
          if (items[0]?.state === "complete") finish();
          else if (items[0]?.state === "interrupted") finish(true);
        },
        () => finish(true),
      );
    });
  } finally {
    URL.revokeObjectURL(url);
  }
}
