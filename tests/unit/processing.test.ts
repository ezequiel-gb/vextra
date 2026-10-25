import { describe, it, expect } from "vitest";
import { documentFixture as doc } from "../fixtures/document.ts";
import {
  paragraphs,
  parseTime,
  resolveSelection,
  searchDocument,
  time,
} from "../../src/processing/text.ts";
describe("selection, reading and search", () => {
  it("uses half-open cue-start ranges, preserving overlap and timing", () => {
    expect(
      resolveSelection(doc, { kind: "range", startMs: 5000, endMs: 13000 }).map(
        (s) => s.id,
      ),
    ).toEqual(["cue-2", "cue-3"]);
  });
  it("rejects invalid ranges and empty selections", () => {
    expect(() =>
      resolveSelection(doc, { kind: "range", startMs: 0, endMs: 0 }),
    ).toThrow();
    expect(() =>
      resolveSelection(doc, { kind: "passages", segmentIds: [] }),
    ).toThrow();
    expect(() =>
      resolveSelection(doc, { kind: "range", startMs: 0, endMs: 31000 }),
    ).toThrow();
  });
  it("unions chapters without duplicates and uses source order for passages", () => {
    expect(
      resolveSelection(doc, {
        kind: "chapters",
        chapterIds: ["chapter-10000", "chapter-0"],
      }).length,
    ).toBe(5);
    expect(
      resolveSelection(doc, {
        kind: "passages",
        segmentIds: ["cue-3", "cue-1"],
      }).map((s) => s.id),
    ).toEqual(["cue-1", "cue-3"]);
  });
  it("does not mutate source or remove intentional repeats; respects discontinuities", () => {
    const before = structuredClone(doc);
    const p = paragraphs(doc);
    expect(p.map((p) => p.text).join(" ")).toContain(
      "Repeat repeat, preserve meaning. Repeat repeat",
    );
    expect(doc).toEqual(before);
    expect(paragraphs(doc, [doc.segments[0]!, doc.segments[2]!])).toHaveLength(
      2,
    );
  });
  it("does not insert spaces within Japanese fragments", () => {
    const a = { ...doc.segments[0]!, text: "日本" },
      b = { ...doc.segments[1]!, text: "語です" };
    expect(
      paragraphs({ ...doc, chapters: [], segments: [a, b] })[0]?.text,
    ).toBe("日本語です");
  });
  it("searches literal text across cue boundaries, RTL and graphemes", () => {
    expect(searchDocument(doc.segments, "WORLD. REPEAT")).toHaveLength(1);
    expect(searchDocument(doc.segments, "مرحبا")[0]?.segmentId).toBe("cue-3");
    expect(searchDocument(doc.segments, "😀")).toHaveLength(1);
    expect(searchDocument(doc.segments, "[")).toHaveLength(0);
  });
  it("supports precise times and hours beyond one day", () => {
    expect(parseTime("01:02:03.4")).toBe(3723400);
    expect(time(90061001, true, true)).toBe("25:01:01,001");
    expect(() => parseTime("00:99")).toThrow();
  });
  it("preserves grapheme boundaries when matching a base letter or expanding case fold", () => {
    const cues = [{ id: "u", startMs: 0, durationMs: 1, text: "é İ 😀" }];
    expect(searchDocument(cues, "e")[0]).toMatchObject({ start: 0, end: 2 });
    expect(searchDocument(cues, "i")[0]).toMatchObject({ start: 3, end: 4 });
  });
});
