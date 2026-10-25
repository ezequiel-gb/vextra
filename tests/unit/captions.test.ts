import { describe, it, expect } from "vitest";
import { parseCaptions } from "../../src/processing/captions.ts";
describe("caption parsing", () => {
  it("preserves JSON3 Unicode, offsets and literal entity-like text", () => {
    const r = parseCaptions(
      JSON.stringify({
        events: [
          {
            tStartMs: 1200,
            dDurationMs: 3000,
            segs: [
              { utf8: "مرحبا " },
              { utf8: "日本語 &amp;", tOffsetMs: 500 },
            ],
          },
        ],
      }),
    );
    expect(r.segments[0]).toMatchObject({
      startMs: 1200,
      durationMs: 3000,
      text: "مرحبا 日本語 &amp;",
    });
  });
  it("parses XML entities once and retains nested text/line breaks", () => {
    const r = parseCaptions(
      '<transcript><text start="1.25" dur="2.5">Hello &amp;amp; &lt;b&gt;world&lt;/b&gt;</text></transcript>',
    );
    expect(r.segments[0]?.text).toBe("Hello &amp; <b>world</b>");
    expect(r.segments[0]?.startMs).toBe(1250);
  });
  it("parses SRV3 timed paragraphs with spans", () => {
    const r = parseCaptions(
      '<timedtext><body><p t="100" d="500"><s>One</s><br/>two</p></body></timedtext>',
    );
    expect(r.segments[0]).toMatchObject({
      startMs: 100,
      durationMs: 500,
      text: "One\ntwo",
    });
  });
  it("infers missing duration and flags reordering and invalid cues", () => {
    const r = parseCaptions(
      JSON.stringify({
        events: [
          { tStartMs: 2000, segs: [{ utf8: "Last" }] },
          { tStartMs: 0, segs: [{ utf8: "First" }] },
          { tStartMs: -1, segs: [{ utf8: "Invalid" }] },
        ],
      }),
      4000,
    );
    expect(r.warnings).toEqual(
      expect.arrayContaining([
        "CUES_REORDERED",
        "TIMING_INFERRED",
        "INVALID_CUES_SKIPPED:1",
      ]),
    );
    expect(r.segments.map((s) => s.durationMs)).toEqual([2000, 2000]);
  });
  it.each([
    "",
    "<html>challenge</html>",
    '<!DOCTYPE x [<!ENTITY e SYSTEM "file:///a">]><transcript/>',
    "<transcript><text>broken",
    '{"events":[]}',
  ])("never returns empty success for %s", (p) =>
    expect(() => parseCaptions(p)).toThrow(),
  );
  it("retains repeated and overlapping source cues", () => {
    const r = parseCaptions(
      '{"events":[{"tStartMs":0,"dDurationMs":3000,"segs":[{"utf8":"go go"}]},{"tStartMs":1000,"dDurationMs":3000,"segs":[{"utf8":"go go"}]}]}',
    );
    expect(r.segments).toHaveLength(2);
  });
});
