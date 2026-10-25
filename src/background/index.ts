import { readPlayer } from "../content/read-player.ts";
import { readNativeTranscript } from "../content/read-transcript.ts";
import { parseUrl } from "../source/youtube/urls.ts";

async function tabFallback() {
  const url = chrome.runtime.getURL("panel.html");
  const found = (await chrome.tabs.query({})).find((t) => t.url === url);
  if (found?.id) await chrome.tabs.update(found.id, { active: true });
  else await chrome.tabs.create({ url });
}
chrome.action.onClicked.addListener((tab) => {
  if (chrome.sidePanel?.open && tab.windowId !== undefined) {
    void chrome.sidePanel.open({ windowId: tab.windowId }).catch(tabFallback);
  } else void tabFallback();
});
chrome.runtime.onInstalled.addListener(() => {
  void chrome.storage.local.setAccessLevel?.({
    accessLevel: "TRUSTED_CONTEXTS",
  });
});
chrome.runtime.onMessage.addListener((message: unknown, sender, respond) => {
  const m = message as Record<string, unknown> | null;
  if (
    !m ||
    m.protocolVersion !== 1 ||
    typeof m.requestId !== "string" ||
    m.requestId.length > 100
  )
    return;
  // Only packaged extension pages may ask for a player snapshot.
  if (
    sender.id !== chrome.runtime.id ||
    !sender.url?.startsWith(chrome.runtime.getURL(""))
  )
    return;
  if (
    !["READ_PLAYER", "READ_NATIVE_TRANSCRIPT"].includes(String(m.type)) ||
    typeof m.tabId !== "number" ||
    !Number.isInteger(m.tabId) ||
    typeof m.videoId !== "string"
  )
    return;
  if (
    m.type === "READ_NATIVE_TRANSCRIPT" &&
    (typeof m.label !== "string" ||
      m.label.length > 200 ||
      typeof m.automatic !== "boolean" ||
      typeof m.uniqueLabel !== "boolean")
  )
    return;
  const requestId = m.requestId,
    tabId = m.tabId,
    videoId = m.videoId;
  void (async () => {
    try {
      const tab = await chrome.tabs.get(tabId);
      if (parseUrl(tab.url ?? "").videoId !== videoId) throw new Error();
      const result =
        m.type === "READ_NATIVE_TRANSCRIPT"
          ? await chrome.scripting.executeScript({
              target: { tabId, frameIds: [0] },
              world: "MAIN",
              func: readNativeTranscript,
              args: [
                {
                  videoId,
                  label: m.label as string,
                  automatic: m.automatic as boolean,
                  uniqueLabel: m.uniqueLabel as boolean,
                },
              ],
            })
          : await chrome.scripting.executeScript({
              target: { tabId, frameIds: [0] },
              world: "MAIN",
              func: readPlayer,
            });
      const latest = await chrome.tabs.get(tabId);
      if (parseUrl(latest.url ?? "").videoId !== videoId) throw new Error();
      respond({ protocolVersion: 1, requestId, data: result[0]?.result });
    } catch {
      respond({ protocolVersion: 1, requestId, error: "PERMISSION_REQUIRED" });
    }
  })();
  return true;
});
