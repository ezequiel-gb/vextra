import { object } from "../model/errors.ts";

export type PageRequest = {
  protocolVersion: 1;
  requestId: string;
  tabId: number;
  videoId: string;
} & (
  | { type: "READ_PLAYER" }
  | {
      type: "READ_NATIVE_TRANSCRIPT";
      label: string;
      automatic: boolean;
      uniqueLabel: boolean;
      singleTrack?: boolean;
    }
);

/** Accept privileged requests only from the two packaged top-level UI pages. */
export function pageRequest(
  raw: unknown,
  sender: chrome.runtime.MessageSender,
): PageRequest | undefined {
  const m = object(raw);
  if (!trustedPage(sender)) return;
  if (
    m.protocolVersion !== 1 ||
    typeof m.requestId !== "string" ||
    !m.requestId ||
    m.requestId.length > 100 ||
    !Number.isSafeInteger(m.tabId) ||
    Number(m.tabId) < 0 ||
    typeof m.videoId !== "string" ||
    !/^[\w-]{11}$/.test(m.videoId)
  )
    return;
  if (m.type === "READ_NATIVE_TRANSCRIPT") {
    if (
      typeof m.label !== "string" ||
      !m.label.trim() ||
      m.label.length > 200 ||
      typeof m.automatic !== "boolean" ||
      typeof m.uniqueLabel !== "boolean" ||
      (m.singleTrack !== undefined && typeof m.singleTrack !== "boolean")
    )
      return;
  } else if (m.type !== "READ_PLAYER") return;
  return m as PageRequest;
}

export function trustedPage(sender: chrome.runtime.MessageSender): boolean {
  if (
    sender.id !== chrome.runtime.id ||
    (sender.frameId !== undefined && sender.frameId !== 0)
  )
    return false;
  try {
    const url = new URL(sender.url ?? "");
    if (
      sender.origin &&
      sender.origin !== chrome.runtime.getURL("").replace(/\/$/, "")
    )
      return false;
    url.search = "";
    url.hash = "";
    if (
      ![
        chrome.runtime.getURL("panel.html"),
        chrome.runtime.getURL("settings.html"),
      ].includes(url.href)
    )
      return false;
  } catch {
    return false;
  }
  return true;
}
