import { afterEach, expect, it } from "vitest";
import { limits } from "../../src/model/limits.ts";
import {
  expandTemplate,
  validateTemplate,
} from "../../src/documents/markdown.ts";
import { parseCaptions } from "../../src/processing/captions.ts";
import { batchInput } from "../../src/source/youtube/urls.ts";
import { archive, combinedMarkdown } from "../../src/export/batch.ts";
import { exportText, filename } from "../../src/export/formats.ts";
import { defaults } from "../../src/model/types.ts";
import { documentFixture as doc } from "../fixtures/document.ts";
const original = { ...limits };
afterEach(() => Object.assign(limits, original));
it("rejects repeated transcript expansion before creating oversized output", () => {
  const transcript = "a".repeat(1024 * 1024);
  expect(() =>
    expandTemplate("{{transcript}}".repeat(101), { transcript }),
  ).toThrow(/100 MiB/);
});
it("enforces template size in UTF-8 bytes", () => {
  expect(() => validateTemplate("é".repeat(26 * 1024))).toThrow(/50 KiB/);
});
it("checks caption byte and event limits before cue conversion", () => {
  Object.assign(limits, { responseBytes: 1024, captionCues: 2 });
  expect(() => parseCaptions("é".repeat(513))).toThrow(/25 MiB/);
  expect(() => parseCaptions('{"events":[null,null,null]}')).toThrow(/300,000/);
  expect(() =>
    parseCaptions("<transcript><text/><text/><text/></transcript>"),
  ).toThrow(/300,000/);
});
it("rejects unsafe source timestamps rather than producing an invalid document", () => {
  expect(() =>
    parseCaptions(
      JSON.stringify({
        events: [
          { tStartMs: 1e100, dDurationMs: 1000, segs: [{ utf8: "text" }] },
        ],
      }),
    ),
  ).toThrow(/No usable captions/);
});
it("identifies oversized URL lists and unique-video counts", () => {
  expect(() => batchInput(" ".repeat(100001))).toThrow(/100,000 characters/);
  const urls = Array.from(
    { length: 101 },
    (_, n) => `https://youtu.be/${String(n).padStart(11, "0")}`,
  ).join("\n");
  expect(() => batchInput(urls)).toThrow(/100 unique videos/);
});
it("bounds single exports, combined documents and ZIP manifests", async () => {
  Object.assign(limits, { exportBytes: 1000 });
  expect(() =>
    exportText(
      { ...doc, title: "a".repeat(1001) },
      { kind: "all" },
      defaults,
      "txt",
    ),
  ).toThrow(/100 MiB/);
  expect(() =>
    combinedMarkdown(
      Array.from({ length: 10 }, () => doc),
      defaults,
      10,
    ),
  ).toThrow(/100 MiB/);
  await expect(
    archive([doc], defaults, "txt", { detail: "x".repeat(1001) }),
  ).rejects.toThrow(/100 MiB/);
});
it("exports only declared JSON fields, excluding unknown acquisition context", () => {
  const polluted = {
    ...doc,
    acquisitionRef: "private-caption-url",
    cookies: "private",
    segments: doc.segments.map((s) => ({ ...s, secret: "private" })),
  };
  const json = exportText(polluted, { kind: "all" }, defaults, "json");
  expect(json).not.toContain("private");
  expect(JSON.parse(json).segments).toEqual(doc.segments);
});
it("removes bidirectional filename controls while preserving transcript text", () => {
  expect(filename({ ...doc, title: "report\u202etxt.exe" }, "md")).toBe(
    "report-txt.exe.md",
  );
});
