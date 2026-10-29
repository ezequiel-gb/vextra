import { object } from "../model/errors.ts";
import { parseUrl } from "../source/youtube/urls.ts";
import { trustedPage } from "./messages.ts";

type OwnedTab = { tabId: number; videoId: string };
const key = "vextraSourceTabs";

/** A port ties a temporary tab to its UI owner, including window closure. */
export function installSourceTabs() {
  let owned: OwnedTab[] = [];
  let reserved = false;
  async function remove(entry: OwnedTab) {
    try {
      const tab = await chrome.tabs.get(entry.tabId);
      if (parseUrl(tab.url ?? "").videoId === entry.videoId)
        await chrome.tabs.remove(entry.tabId);
    } catch {
      /* The user may already have closed or navigated the owned tab. */
    }
  }
  // A restarted service worker reclaims only tabs recorded by this extension.
  const recovered = chrome.storage.session
    .get(key)
    .then(async (data) => {
      const previous = data[key];
      if (Array.isArray(previous))
        for (const raw of previous) {
          const entry = object(raw);
          if (
            Number.isSafeInteger(entry.tabId) &&
            typeof entry.videoId === "string" &&
            /^[\w-]{11}$/.test(entry.videoId)
          )
            await remove(entry as OwnedTab);
        }
      await chrome.storage.session.remove(key);
    })
    .then(
      () => true,
      () => false,
    );
  chrome.runtime.onConnect.addListener((port) => {
    if (port.name !== "vextra-source-v1" || !trustedPage(port.sender ?? {})) {
      port.disconnect();
      return;
    }
    let closed = false,
      started = false,
      creating = false,
      ownsReservation = false,
      entry: OwnedTab | undefined;
    let cleaning: Promise<void> | undefined;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const finish = async () => {
      closed = true;
      clearTimeout(timer);
      if (creating) return;
      if (cleaning) return cleaning;
      cleaning = (async () => {
        if (entry) {
          const previous = entry;
          entry = undefined;
          await remove(previous);
          owned = owned.filter((x) => x.tabId !== previous.tabId);
          await chrome.storage.session.set({ [key]: owned });
        }
        if (ownsReservation) {
          reserved = false;
          ownsReservation = false;
        }
      })();
      return cleaning;
    };
    port.onDisconnect.addListener(() => {
      void finish();
    });
    port.onMessage.addListener((raw: unknown) => {
      if (started) return;
      started = true;
      const videoId = object(raw).videoId;
      if (typeof videoId !== "string" || !/^[\w-]{11}$/.test(videoId)) {
        port.disconnect();
        return;
      }
      void (async () => {
        if (!(await recovered)) {
          if (!closed) port.postMessage({ error: "PERMISSION_REQUIRED" });
          return;
        }
        if (closed) return;
        if (reserved) {
          port.postMessage({ error: "BUSY" });
          return;
        }
        reserved = true;
        ownsReservation = true;
        creating = true;
        try {
          timer = setTimeout(() => {
            if (!closed) port.postMessage({ error: "TIMEOUT" });
            port.disconnect();
            void finish();
          }, 65_000);
          const tab = await chrome.tabs.create({
            url: `https://www.youtube.com/watch?v=${videoId}&autoplay=0`,
            active: false,
          });
          if (tab.id === undefined) throw new Error();
          entry = { tabId: tab.id, videoId };
          owned.push(entry);
          await chrome.storage.session.set({ [key]: owned });
          await chrome.tabs.update(tab.id, { muted: true });
          creating = false;
          if (closed) return;
          const deadline = Date.now() + 25_000;
          while (!closed && Date.now() < deadline) {
            const current = await chrome.tabs.get(tab.id);
            if (current.status === "complete") {
              if (parseUrl(current.url ?? "").videoId !== videoId)
                throw new Error();
              // YouTube hydrates its player/transcript context after document load.
              // Keep the page muted while that ordinary client initialises.
              await new Promise<void>((resolve) => setTimeout(resolve, 5_000));
              if (closed) return;
              await chrome.scripting.executeScript({
                target: { tabId: tab.id, frameIds: [0] },
                func: () => {
                  document
                    .querySelectorAll("video")
                    .forEach((video) => video.pause());
                },
              });
              port.postMessage({ tabId: tab.id });
              return;
            }
            await new Promise<void>((resolve) => setTimeout(resolve, 250));
          }
          if (!closed) port.postMessage({ error: "TIMEOUT" });
        } catch {
          if (!closed) port.postMessage({ error: "PERMISSION_REQUIRED" });
        } finally {
          creating = false;
          // Keep the reservation until the requesting operation disconnects.
          if (closed) await finish();
        }
      })();
    });
  });
}
