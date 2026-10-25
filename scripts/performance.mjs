import { performance } from "node:perf_hooks";
import { writeFile, mkdir } from "node:fs/promises";
import { cpus, totalmem } from "node:os";
import { documentFixture } from "../tests/fixtures/document.ts";
import { defaults } from "../src/model/types.ts";
import { exportText } from "../src/export/formats.ts";
import { searchDocument } from "../src/processing/text.ts";
const doc = {
  ...documentFixture,
  durationMs: 30000 * 1000,
  chapters: [],
  segments: Array.from({ length: 30000 }, (_, i) => ({
    id: `s-${i}`,
    startMs: i * 1000,
    durationMs: 1000,
    text: `Caption ${i} contains accurate Unicode 日本語 مرحبا and a deliberate repeated word word.`,
  })),
};
let start = performance.now();
const md = exportText(doc, { kind: "all" }, defaults, "md");
const markdownMs = performance.now() - start;
const searches = [];
for (let i = 0; i < 20; i++) {
  start = performance.now();
  const result = searchDocument(doc.segments, `Caption ${i * 1317}`);
  searches.push({
    milliseconds: performance.now() - start,
    matches: result.length,
  });
}
const durations = searches.map((s) => s.milliseconds).sort((a, b) => a - b);
const result = {
  date: new Date().toISOString(),
  context: "Node core benchmark, not browser/UI/worker latency",
  node: process.version,
  cpu: cpus()[0]?.model,
  memoryGiB: Math.round(totalmem() / 2 ** 30),
  cues: doc.segments.length,
  sourceHours: doc.durationMs / 3600000,
  markdownMs,
  markdownBytes: new TextEncoder().encode(md).length,
  searchP95Ms: durations[18],
  searches,
};
await mkdir("artifacts", { recursive: true });
await writeFile(
  "artifacts/performance-node.json",
  JSON.stringify(result, null, 2),
);
console.log(JSON.stringify({ ...result, searches: undefined }, null, 2));
