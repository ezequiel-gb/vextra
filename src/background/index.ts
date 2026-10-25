import { readPlayer } from "../content/read-player.ts";
import { readNativeTranscript } from "../content/read-transcript.ts";
import { parseUrl } from "../source/youtube/urls.ts";
import { pageRequest } from "./messages.ts";

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
  const m = pageRequest(message, sender);
  if (!m) return;
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
                  label: m.label,
                  automatic: m.automatic,
                  uniqueLabel: m.uniqueLabel,
                  singleTrack: m.singleTrack === true,
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
