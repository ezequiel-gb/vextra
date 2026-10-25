import { mkdir, writeFile } from "node:fs/promises";
import { discoveryFromHtml } from "../src/source/youtube/discovery.ts";
import { captionUrl } from "../src/source/youtube/urls.ts";
import { youtubeRequest } from "../src/source/youtube/request.ts";
import { parseCaptions } from "../src/processing/captions.ts";
import { JSDOM } from "jsdom";
globalThis.DOMParser = new JSDOM("").window.DOMParser;
const ids = process.argv.slice(2);
if (!ids.length)
  ids.push(
    "jNQXAC9IVRw",
    "dQw4w9WgXcQ",
    "aircAruvnKk",
    "rfscVS0vtbw",
    "jfKfPfyJRdk",
    "aqz-KE-bpKQ",
  );
const results = [];
for (const id of ids) {
  try {
    const signal = AbortSignal.timeout(90000);
    const html = await youtubeRequest(
      new URL(`https://www.youtube.com/watch?v=${id}`),
      signal,
    );
    const d = discoveryFromHtml(html, id);
    const track =
      d.tracks.find(
        (t) => t.languageCode === "en" && t.captionType === "manual",
      ) ??
      d.tracks.find((t) => t.languageCode === "en") ??
      d.tracks[0];
    const payload = await youtubeRequest(
      captionUrl(track.acquisitionRef),
      signal,
    );
    const parsed = parseCaptions(payload, d.durationMs);
    results.push({
      videoId: id,
      outcome: "extracted",
      adapter: d.adapterId,
      language: track.languageCode,
      captionType: track.captionType,
      tracks: d.tracks.length,
      cues: parsed.segments.length,
      warnings: parsed.warnings,
    });
  } catch (e) {
    results.push({
      videoId: id,
      outcome: "failed",
      code: e.code ?? e.name,
      message: e.message,
    });
  }
  console.log(JSON.stringify(results.at(-1)));
  await new Promise((resolve) => setTimeout(resolve, 1100));
}
await mkdir("artifacts", { recursive: true });
await writeFile(
  "artifacts/live-node-results.json",
  JSON.stringify(
    {
      date: new Date().toISOString(),
      context:
        "Node.js public-fetch probe; NOT installed-extension browser validation",
      results,
    },
    null,
    2,
  ),
);
if (!results.some((r) => r.outcome === "extracted")) process.exitCode = 1;
