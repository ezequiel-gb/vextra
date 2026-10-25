import { chromium } from "playwright";
import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
await mkdir(".profiles", { recursive: true });
const profile = await mkdtemp(resolve(".profiles/native-"));
const browser = await chromium.launchPersistentContext(profile, {
  channel: "msedge",
  headless: true,
  viewport: { width: 1280, height: 1100 },
  args: ["--autoplay-policy=user-gesture-required"],
});
try {
  const page = await browser.newPage();
  await page.goto(
    "https://www.youtube.com/watch?v=" + (process.argv[2] ?? "h3mRsvFmWi0"),
    { waitUntil: "domcontentloaded" },
  );
  // Isolated test profile only: reject optional cookies through the normal UI.
  await page.waitForTimeout(1500);
  await page
    .getByRole("button")
    .filter({ hasText: /^Reject all$/i })
    .first()
    .click({ timeout: 8000 })
    .catch((e) => console.log("Consent click: " + e.message.split("\n")[0]));
  await page.locator("ytd-watch-metadata").waitFor();
  await page
    .locator("ytd-watch-metadata #expand:visible")
    .first()
    .click({ timeout: 5000 })
    .catch(() => undefined);
  const candidates = await page
    .locator("ytd-video-description-transcript-section-renderer")
    .evaluateAll((nodes) =>
      nodes.map((n) => ({
        tag: n.tagName,
        text: n.textContent?.trim().slice(0, 300),
        buttons: [...n.querySelectorAll("button")].map((b) => ({
          label: b.getAttribute("aria-label"),
          text: b.textContent,
        })),
      })),
    );
  console.log(JSON.stringify({ candidates }));
  console.log(
    JSON.stringify(
      await page
        .locator(
          "ytd-watch-metadata #expand, ytd-watch-metadata #description, ytd-video-description-transcript-section-renderer button",
        )
        .evaluateAll((nodes) =>
          nodes.map((n) => ({
            tag: n.tagName,
            id: n.id,
            visible: n.getClientRects().length > 0,
            text: n.textContent?.trim().slice(0, 80),
          })),
        ),
    ),
  );
  await page.screenshot({ path: "artifacts/native-probe-page.png" });
  const button = page
    .locator("ytd-video-description-transcript-section-renderer button:visible")
    .first();
  if (await button.count()) await button.click();
  await page.waitForTimeout(1000);
  console.log(
    JSON.stringify({ tabs: await page.getByRole("tab").allTextContents() }),
  );
  await page
    .getByRole("tab", { name: "Transcript", exact: true })
    .click({ timeout: 3000 })
    .catch(() => undefined);
  await page.screenshot({ path: "artifacts/native-panel-page.png" });
  await page
    .locator("ytd-transcript-segment-renderer")
    .first()
    .waitFor({ timeout: 20000 })
    .catch(() => undefined);
  console.log(
    JSON.stringify(
      await page.evaluate(() => ({
        transcriptTags: [
          ...new Set(
            [...document.querySelectorAll("*")]
              .map((n) => n.tagName.toLowerCase())
              .filter((t) => t.includes("transcript")),
          ),
        ],
        panels: [
          ...document.querySelectorAll(
            'ytd-engagement-panel-section-list-renderer[visibility="ENGAGEMENT_PANEL_VISIBILITY_EXPANDED"]',
          ),
        ].map((n) => ({
          target: n.getAttribute("target-id"),
          textLength: n.textContent?.length,
          timeLabels: (n.textContent?.match(/\b\d+:\d{2}\b/g) ?? []).length,
        })),
      })),
    ),
  );
  await page.screenshot({ path: "artifacts/native-panel-final.png" });
  const result = await page.evaluate(() => ({
    segments: document.querySelectorAll("ytd-transcript-segment-renderer")
      .length,
    firstKeys: Object.keys(
      document.querySelector("ytd-transcript-segment-renderer")?.data ?? {},
    ),
    footer: [
      ...document.querySelectorAll("ytd-transcript-footer-renderer"),
    ].map((n) => n.textContent?.trim()),
    lastTime: document
      .querySelectorAll("ytd-transcript-segment-renderer .segment-timestamp")
      .item(
        document.querySelectorAll(
          "ytd-transcript-segment-renderer .segment-timestamp",
        ).length - 1,
      )
      ?.textContent?.trim(),
  }));
  console.log(JSON.stringify(result));
  await writeFile(
    "artifacts/native-probe.json",
    JSON.stringify(
      {
        date: new Date().toISOString(),
        videoId: process.argv[2] ?? "h3mRsvFmWi0",
        context:
          "Isolated Edge; normal Reject all consent choice; expanded description; Show transcript; combined Transcript tab",
        outcome: result.segments
          ? "entries-observed"
          : "no-entries-after-20-second-wait",
        ...result,
      },
      null,
      2,
    ),
  );
  if (!result.segments) process.exitCode = 1;
} finally {
  await browser.close();
}
