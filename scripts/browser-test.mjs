import { chromium } from "playwright";
import { resolve } from "node:path";
import { mkdir, writeFile, mkdtemp } from "node:fs/promises";
import assert from "node:assert/strict";
import { documentFixture } from "../tests/fixtures/document.ts";
const extension = resolve("dist/chromium-panel");
await mkdir("artifacts", { recursive: true });
const live = process.argv.includes("--live");
const channel = process.argv.includes("--edge") ? "msedge" : "chromium";
await mkdir(".profiles", { recursive: true });
const profile = await mkdtemp(resolve(`.profiles/${channel}-`));
const context = await chromium.launchPersistentContext(profile, {
  channel,
  headless: true,
  args: [
    `--disable-extensions-except=${extension}`,
    `--load-extension=${extension}`,
    "--autoplay-policy=user-gesture-required",
  ],
  acceptDownloads: true,
});
const results = [],
  errors = [];
let liveSuccess = false;
try {
  const service =
    context.serviceWorkers()[0] ??
    (await context.waitForEvent("serviceworker", { timeout: 15000 }));
  const id = new URL(service.url()).host;
  await service.evaluate(() => {
    globalThis.__messageDiagnostics = [];
    chrome.runtime.onMessage.addListener((m, s) => {
      globalThis.__messageDiagnostics.push({
        type: m?.type,
        senderId: s.id,
        senderUrl: s.url,
        extensionUrl: chrome.runtime.getURL(""),
        tab: Boolean(s.tab),
      });
    });
  });
  const page = await context.newPage();
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto(`chrome-extension://${id}/panel.html`);
  await page.getByRole("heading", { name: "Vextra." }).waitFor();
  results.push("Packaged extension startup");
  for (const width of [320, 400, 600, 1200]) {
    await page.setViewportSize({ width, height: 900 });
    assert.equal(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
      true,
    );
  }
  results.push("No horizontal overflow at 320/400/600/1200 CSS px");
  await page.getByRole("button", { name: "Settings", exact: true }).click();
  await page.getByRole("combobox", { name: /^Theme/ }).selectOption("dark");
  assert.equal(await page.locator("html").getAttribute("data-theme"), "dark");
  await page.reload();
  assert.equal(await page.locator("html").getAttribute("data-theme"), "dark");
  await page.getByRole("button", { name: "Settings", exact: true }).click();
  await page.getByRole("combobox", { name: /^Theme/ }).selectOption("light");
  await page.getByRole("button", { name: "Back to workspace" }).click();
  results.push("Theme updates and settings persistence after reload");
  await page.getByRole("button", { name: "From URL", exact: true }).click();
  await page
    .getByLabel("YouTube video URL")
    .fill("https://youtube.com.evil.example/watch?v=dQw4w9WgXcQ");
  await page.getByRole("button", { name: "Find caption languages" }).click();
  await page.getByRole("alert").waitFor();
  assert.match(await page.getByRole("alert").innerText(), /supported YouTube/);
  results.push("Unsupported URL rejected in installed extension");
  await page.screenshot({
    path: "artifacts/browser-light.png",
    fullPage: true,
  });
  if (live) {
    await page
      .getByLabel("YouTube video URL")
      .fill("https://www.youtube.com/watch?v=aircAruvnKk");
    await page.getByRole("button", { name: "Find caption languages" }).click();
    await page
      .getByRole("button", { name: "Extract Transcript", exact: true })
      .waitFor({ timeout: 45000 });
    const tracks = await page
      .getByRole("combobox", { name: /^Caption language/ })
      .locator("option")
      .allTextContents();
    await page
      .getByRole("button", { name: "Extract Transcript", exact: true })
      .click();
    await page.waitForFunction(
      () => !document.querySelector("button.full.primary")?.disabled,
      null,
      { timeout: 45000 },
    );
    results.push({
      livePastedUrl: "aircAruvnKk",
      tracks: tracks.length,
      status: await page.getByRole("status").first().innerText(),
      alert: await page.getByRole("alert").allTextContents(),
    });
    liveSuccess =
      (await page.getByRole("button", { name: /^Download \.md$/ }).count()) > 0;
    // Open a real video in a new tab, then exercise the packaged player-reader message boundary.
    const video = await context.newPage();
    await video.goto("https://www.youtube.com/watch?v=aircAruvnKk", {
      waitUntil: "domcontentloaded",
      timeout: 45000,
    });
    await video
      .waitForFunction(
        () =>
          typeof document.querySelector("#movie_player")?.getPlayerResponse ===
          "function",
        null,
        { timeout: 30000 },
      )
      .catch(() => undefined);
    const pageState = await video.evaluate(() => ({
      title: document.title,
      host: location.hostname,
      hasPlayer: Boolean(document.querySelector("#movie_player")),
      hasConsent: document.body.innerText.includes("Before you continue"),
    }));
    const snapshot = await page.evaluate(async () => {
      const tabs = await chrome.tabs.query({
        url: "https://www.youtube.com/watch*",
      });
      const tab = tabs.find((t) => t.url?.includes("aircAruvnKk"));
      if (!tab) return { error: "No video tab" };
      const r = await chrome.runtime.sendMessage({
        protocolVersion: 1,
        requestId: crypto.randomUUID(),
        type: "READ_PLAYER",
        videoId: "aircAruvnKk",
        tabId: tab.id,
      });
      if (!r) return { error: "Packaged reader did not reply" };
      const p = r?.data?.player;
      const track =
        p?.captions?.playerCaptionsTracklistRenderer?.captionTracks?.[0];
      let captionBytes;
      if (track?.baseUrl) {
        const response = await fetch(track.baseUrl, {
          credentials: "omit",
          redirect: "error",
        });
        captionBytes = (await response.text()).length;
      }
      return {
        videoId: p?.videoDetails?.videoId,
        trackCount:
          p?.captions?.playerCaptionsTracklistRenderer?.captionTracks?.length,
        error: r?.error,
        captionBytes,
      };
    });
    results.push({
      liveActivePlayer: snapshot,
      pageState,
      messageDiagnostics: await service.evaluate(() =>
        globalThis.__messageDiagnostics.filter((m) => m.type === "READ_PLAYER"),
      ),
    });
  }
  if (process.argv.includes("--fixtures")) {
    // Test-only persistence injection exercises recovery/export UI. No mock
    // source adapter or fixture data is bundled in production output.
    await page.evaluate(async (doc) => {
      await new Promise((resolve, reject) => {
        const request = indexedDB.open("vextra", 1);
        request.onerror = () => reject(request.error);
        request.onsuccess = () => {
          const db = request.result,
            tx = db.transaction(["documents", "batches"], "readwrite");
          tx.objectStore("documents").put({
            id: doc.documentId,
            value: doc,
            expires: Date.now() + 86400000,
            bytes: JSON.stringify(doc).length,
          });
          tx.objectStore("batches").put({
            id: "browser-fixture-batch",
            createdAt: Date.now(),
            updatedAt: Date.now(),
            cancelled: false,
            items: [
              {
                videoId: doc.videoId,
                sourceUrl: doc.sourceUrl,
                status: "completed",
                attempts: 1,
                documentId: doc.documentId,
              },
            ],
          });
          tx.oncomplete = () => {
            db.close();
            resolve();
          };
          tx.onerror = () => reject(tx.error);
        };
      });
    }, documentFixture);
    await page.reload();
    await page
      .getByRole("button", { name: "Preview Markdown document" })
      .waitFor();
    await page
      .getByRole("button", { name: "Preview Markdown document" })
      .click();
    await page
      .getByRole("heading", { name: "Document preview", exact: true })
      .waitFor();
    await page
      .getByRole("searchbox", { name: "Search transcript" })
      .fill("repeat");
    await page.getByText("1 of 4 matches", { exact: true }).waitFor();
    await page.getByRole("button", { name: "Next match", exact: true }).click();
    await page.getByText("2 of 4 matches", { exact: true }).waitFor();
    results.push(
      "Fixture-only: persisted document recovery, Markdown worker preview and complete search",
    );
    const download = async (format) => {
      const menu = page.locator("details.formats");
      if (format !== "md") await menu.locator("summary").click();
      const waiting = page.waitForEvent("download");
      if (format === "md")
        await page
          .getByRole("button", { name: "Download .md", exact: true })
          .first()
          .click();
      else
        await menu
          .getByRole("button", { name: `Download .${format}`, exact: true })
          .click();
      const d = await waiting;
      await d.saveAs(`artifacts/browser-fixture.${format}`);
      assert.equal(await d.failure(), null);
      if (format !== "md") await menu.locator("summary").click();
    };
    for (const format of ["md", "txt", "srt", "vtt", "json"])
      await download(format);
    results.push("Fixture-only: five actual completed browser downloads");
    await page
      .getByRole("combobox", { name: /^Export selection/ })
      .selectOption("range");
    await page.getByLabel("From", { exact: true }).fill("00:05");
    await page.getByLabel("Until", { exact: true }).fill("00:13");
    await page
      .getByText("2 cues · 00:00:05–00:00:12", { exact: false })
      .waitFor();
    await page
      .getByRole("combobox", { name: /^Export selection/ })
      .selectOption("all");
    await page.getByRole("button", { name: "Batch URLs", exact: true }).click();
    const waiting = page.waitForEvent("download");
    await page
      .getByRole("button", { name: "Download ZIP", exact: true })
      .click();
    const zip = await waiting;
    await zip.saveAs("artifacts/browser-fixture.zip");
    assert.equal(await zip.failure(), null);
    results.push(
      "Fixture-only: range selection and persisted batch ZIP download",
    );
    await page.setViewportSize({ width: 400, height: 900 });
    await page
      .getByRole("heading", { name: "Document preview", exact: true })
      .waitFor();
    await page.screenshot({
      path: "artifacts/browser-reading-light.png",
      fullPage: true,
    });
    await page.getByRole("button", { name: "Settings", exact: true }).click();
    await page.getByRole("combobox", { name: /^Theme/ }).selectOption("dark");
    await page.getByRole("button", { name: "Back to workspace" }).click();
    await page
      .getByRole("heading", { name: "Document preview", exact: true })
      .waitFor();
    await page.screenshot({
      path: "artifacts/browser-reading-dark.png",
      fullPage: true,
    });
  }
  assert.deepEqual(errors, []);
  results.push("No extension page runtime errors");
  await writeFile(
    `artifacts/browser-results${live ? "-live" : ""}${process.argv.includes("--fixtures") ? "-fixtures" : ""}.json`,
    JSON.stringify(
      {
        date: new Date().toISOString(),
        browser: context.browser()?.version(),
        results,
        errors,
        liveGate: live
          ? liveSuccess
            ? "passed"
            : "FAILED: no validated nonempty live transcript"
          : "not requested",
      },
      null,
      2,
    ),
  );
  console.log(JSON.stringify(results, null, 2));
  if (live && !liveSuccess) process.exitCode = 2;
} finally {
  await context.close();
}
