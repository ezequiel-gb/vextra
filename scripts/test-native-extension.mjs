import { chromium } from "playwright";
import { resolve } from "node:path";
import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
await mkdir(".profiles", { recursive: true });
const path = resolve("dist/chromium-panel"),
  profile = await mkdtemp(resolve(".profiles/native-extension-"));
const context = await chromium.launchPersistentContext(profile, {
  channel: "msedge",
  headless: true,
  viewport: { width: 1280, height: 1100 },
  args: [
    `--disable-extensions-except=${path}`,
    `--load-extension=${path}`,
    "--autoplay-policy=user-gesture-required",
  ],
});
try {
  const service =
    context.serviceWorkers()[0] ??
    (await context.waitForEvent("serviceworker"));
  const extensionId = new URL(service.url()).host;
  const panel = await context.newPage();
  await panel.goto(`chrome-extension://${extensionId}/panel.html`);
  const video = await context.newPage();
  await video.goto("https://www.youtube.com/watch?v=h3mRsvFmWi0", {
    waitUntil: "domcontentloaded",
  });
  await video
    .getByRole("button")
    .filter({ hasText: /^Reject all$/i })
    .first()
    .click({ timeout: 8000 })
    .catch(() => undefined);
  await video.locator("ytd-watch-metadata").waitFor();
  const result = await panel.evaluate(async () => {
    const tabs = await chrome.tabs.query({
        url: "https://www.youtube.com/watch*",
      }),
      tab = tabs.find((t) => t.url?.includes("h3mRsvFmWi0"));
    const response = await chrome.runtime.sendMessage({
      protocolVersion: 1,
      requestId: crypto.randomUUID(),
      type: "READ_NATIVE_TRANSCRIPT",
      tabId: tab?.id,
      videoId: "h3mRsvFmWi0",
      label: "English",
      automatic: false,
      uniqueLabel: true,
    });
    const data = response?.data;
    return {
      replyReceived: Boolean(response),
      error: response?.error ?? data?.error,
      cues:
        typeof data?.payload === "string"
          ? JSON.parse(data.payload).events?.length
          : 0,
    };
  });
  const report = {
    date: new Date().toISOString(),
    browser: context.browser()?.version(),
    videoId: "h3mRsvFmWi0",
    context: "Actual packaged native transcript adapter, isolated Edge",
    ...result,
  };
  await writeFile(
    "artifacts/native-extension-results.json",
    JSON.stringify(report, null, 2),
  );
  console.log(JSON.stringify(report, null, 2));
  if (!result.cues) process.exitCode = 2;
} finally {
  await context.close();
}
