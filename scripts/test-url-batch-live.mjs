import { chromium } from "playwright";
import { resolve, sep } from "node:path";
import { readFile, writeFile, mkdir, mkdtemp } from "node:fs/promises";
import assert from "node:assert/strict";
import AdmZip from "adm-zip";
const args = process.argv.slice(2);
const cases = args.filter((x) => !x.startsWith("--"));
if (cases.length < 2 || cases.some((id) => !/^[-\w]{11}$/.test(id)))
  throw new Error("Supply at least two public, captioned YouTube video IDs.");
await mkdir(".profiles", { recursive: true });
await mkdir("artifacts", { recursive: true });
const requestedProfile = process.env.VEXTRA_TEST_PROFILE;
const profile = requestedProfile
  ? resolve(requestedProfile)
  : await mkdtemp(resolve(".profiles/url-batch-live-"));
if (!profile.startsWith(resolve(".profiles") + sep))
  throw new Error(
    "Live tests require a dedicated profile inside this project's .profiles directory.",
  );

const context = await chromium.launchPersistentContext(profile, {
  channel: args.includes("--edge") ? "msedge" : undefined,
  headless: true,
  viewport: { width: 1280, height: 1100 },
  args: [
    `--disable-extensions-except=${resolve("dist/chromium-panel")}`,
    `--load-extension=${resolve("dist/chromium-panel")}`,
  ],
  acceptDownloads: true,
});
const results = [],
  diagnostics = [];
let panel;
async function clear() {
  await panel.getByRole("button", { name: "Settings", exact: true }).click();
  await panel
    .getByRole("button", { name: "Clear temporary transcripts", exact: true })
    .click();
  await panel
    .locator(".settings")
    .getByText("Temporary transcripts and batches cleared.", { exact: true })
    .waitFor();
  await panel
    .getByRole("button", { name: "Back to workspace", exact: true })
    .click();
  assert.equal(await panel.locator(".document").count(), 0);
}
async function download(name, path) {
  const event = panel.waitForEvent("download");
  await panel.getByRole("button", { name, exact: true }).first().click();
  const file = await event;
  await file.saveAs(path);
  assert.equal(await file.failure(), null);
  return readFile(path);
}
async function extract(mode, videoId) {
  await panel.getByRole("button", { name: mode, exact: true }).click();
  if (mode === "From URL")
    await panel
      .getByLabel("YouTube video URL")
      .fill("https://www.youtube.com/watch?v=" + videoId);
  else
    await panel
      .getByRole("button", { name: "Refresh current video", exact: true })
      .click();
  await panel
    .getByRole("button", { name: "Find caption languages", exact: true })
    .click();
  const button = panel.getByRole("button", {
    name: "Extract Transcript",
    exact: true,
  });
  await button.waitFor({ timeout: 30000 });
  await panel.locator("select").first().waitFor({ timeout: 30000 });
  await panel.waitForFunction(
    () => document.querySelector("select")?.options.length > 0,
  );
  const trackInfo = await panel
    .locator("select")
    .first()
    .locator("option")
    .allTextContents();
  await button.click();
  await panel.locator(".document").waitFor({ timeout: 85000 });
  const summary = await panel.locator(".document > .hint").innerText();
  await panel
    .locator("summary")
    .filter({ hasText: "Other export formats" })
    .click();
  const stem =
    "artifacts/live-" +
    videoId +
    "-" +
    (mode === "From URL" ? "url" : "current");
  const json = JSON.parse(
    (await download("Download .json", stem + ".json")).toString("utf8"),
  );
  assert(json.segments.length > 0);
  assert.equal(json.videoId, videoId);
  assert(
    json.segments.every((s) => s.text.trim() && Number.isFinite(s.startMs)),
  );
  const md = await download("Download .md", stem + ".md");
  assert(md.length > 100);
  return { json, summary, trackInfo, markdownBytes: md.length };
}
try {
  const worker =
    context.serviceWorkers()[0] ??
    (await context.waitForEvent("serviceworker"));
  const id = new URL(worker.url()).host;
  const reloaded = context.waitForEvent("serviceworker", { timeout: 15_000 });
  await worker.evaluate(() => chrome.runtime.reload()).catch(() => undefined);
  await reloaded;
  panel = await context.newPage();
  await panel.goto(`chrome-extension://${id}/panel.html`);
  await panel.evaluate(() => sessionStorage.setItem("vextra:diagnostics", "1"));
  panel.on("console", async (m) => {
    if (m.text().startsWith("[Vextra extraction]")) {
      try {
        diagnostics.push(await m.args()[1].jsonValue());
      } catch {
        // A console handle may be disposed when its page closes.
      }
    }
  });
  for (const videoId of cases) {
    await clear();
    const url = await extract("From URL", videoId);
    await panel.waitForFunction(
      async () =>
        !(await chrome.tabs.query({ url: "https://www.youtube.com/watch*" }))
          .length,
      {},
      { timeout: 10000 },
    );
    await clear();
    const page = await context.newPage();
    await page.goto("https://www.youtube.com/watch?v=" + videoId, {
      waitUntil: "domcontentloaded",
    });
    await page.locator("ytd-watch-metadata").waitFor({ timeout: 30000 });
    await page.bringToFront();
    const current = await extract("Current Video", videoId);
    assert.deepEqual(current.json.segments, url.json.segments);
    const item = {
      videoId,
      title: url.json.title,
      durationMs: url.json.durationMs,
      availableTracks: url.trackInfo,
      cues: url.json.segments.length,
      currentAndUrlSegmentsEqual: true,
      urlMarkdownBytes: url.markdownBytes,
      currentMarkdownBytes: current.markdownBytes,
      language: url.json.language,
      captionType: url.json.captionType,
    };
    results.push(item);
    console.log(JSON.stringify(item));
    await page.close();
    await writeFile(
      "artifacts/url-batch-live-matrix.json",
      JSON.stringify(
        {
          date: new Date().toISOString(),
          browser: context.browser()?.version(),
          results,
          diagnostics,
        },
        null,
        2,
      ),
    );
  }
  await clear();
  await panel.getByRole("button", { name: "Batch URLs", exact: true }).click();
  await panel.getByLabel("YouTube URLs", { exact: true }).fill(
    cases
      .slice(0, 2)
      .map((id) => "https://www.youtube.com/watch?v=" + id)
      .concat("https://www.youtube.com/watch?v=aaaaaaaaaaa")
      .join("\n"),
  );
  await panel
    .getByRole("button", { name: "Extract batch", exact: true })
    .click();
  await panel
    .getByText("Batch processing finished. Review individual results below.", {
      exact: true,
    })
    .waitFor({ timeout: 260000 });
  const statuses = await panel
    .locator(".batch-results .badge")
    .allTextContents();
  console.log(JSON.stringify({ batchStatuses: statuses }));
  assert.equal(statuses.filter((x) => x === "completed").length, 2);
  const zip = await download("Download ZIP", "artifacts/live-url-batch.zip");
  const entries = new AdmZip(zip).getEntries();
  assert(entries.filter((e) => e.entryName.endsWith(".md")).length >= 2);
  const combined = await download(
    "Combined Markdown",
    "artifacts/live-url-batch.md",
  );
  assert(combined.toString().includes("2 of 3 videos exported"));
  const batch = {
    statuses,
    zipBytes: zip.length,
    zipEntries: entries.map((e) => e.entryName),
    combinedMarkdownBytes: combined.length,
  };
  await writeFile(
    "artifacts/url-batch-live-matrix.json",
    JSON.stringify(
      {
        date: new Date().toISOString(),
        browser: context.browser()?.version(),
        results,
        batch,
        diagnostics,
      },
      null,
      2,
    ),
  );
  console.log(JSON.stringify({ batch }));
} catch (e) {
  console.log(
    JSON.stringify({
      error: e.message,
      alerts: await panel?.getByRole("alert").allTextContents(),
      results,
    }),
  );
  throw e;
} finally {
  await writeFile(
    "artifacts/url-matrix-diagnostics.json",
    JSON.stringify(diagnostics, null, 2),
  );
  await context.close();
}
