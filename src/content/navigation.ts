let previous = location.href;
let timer: ReturnType<typeof setTimeout> | undefined;
function changed() {
  clearTimeout(timer);
  timer = setTimeout(() => {
    if (location.href === previous) return;
    previous = location.href;
    void chrome.runtime
      .sendMessage({
        protocolVersion: 1,
        requestId: crypto.randomUUID(),
        type: "VIDEO_NAVIGATED",
      })
      .catch(() => undefined);
  }, 150);
}
document.addEventListener("yt-navigate-finish", changed);
window.addEventListener("popstate", changed);
window.addEventListener("focus", changed);
document.addEventListener("visibilitychange", changed);
const observer = new MutationObserver(changed);
const title = document.querySelector("title");
if (title)
  observer.observe(title, {
    childList: true,
    characterData: true,
    subtree: true,
  });
window.addEventListener(
  "pagehide",
  () => {
    clearTimeout(timer);
    observer.disconnect();
  },
  { once: true },
);
