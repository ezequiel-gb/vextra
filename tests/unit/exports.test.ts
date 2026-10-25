import { describe, it, expect } from "vitest";
import { unzipSync, strFromU8 } from "fflate";
import { documentFixture as doc } from "../fixtures/document.ts";
import { defaults } from "../../src/model/types.ts";
import { exportText, filename } from "../../src/export/formats.ts";
import { archive, combinedMarkdown } from "../../src/export/batch.ts";
import {
  expandTemplate,
  validateTemplate,
} from "../../src/documents/markdown.ts";
const all = { kind: "all" } as const;
describe("documents and exports", () => {
  it("escapes untrusted Markdown without altering source", () => {
    const md = exportText(doc, all, defaults, "md");
    expect(md).toContain("\\<script\\>");
    expect(md).toContain("## Opening");
    expect(md).toContain("## Details");
    expect(doc.title).toContain("<script>");
  });
  it("archive preserves original repeats and timestamps", () => {
    const md = exportText(
      doc,
      all,
      { ...defaults, preset: "archive", timestamps: true },
      "md",
    );
    expect(md.match(/Repeat repeat/g)).toHaveLength(2);
    expect(md).toContain("&t=2)");
  });
  it("omits missing metadata and produces plain TXT", () => {
    const txt = exportText(
      { ...doc, title: undefined, channel: undefined, durationMs: undefined },
      all,
      defaults,
      "txt",
    );
    expect(txt).not.toMatch(/undefined|\\</);
    expect(txt).toContain("<unsafe>");
  });
  it("produces timed subtitle files from original cues regardless of document settings", () => {
    const srt = exportText(
      doc,
      { kind: "range", startMs: 5000, endMs: 13000 },
      { ...defaults, timestamps: false },
      "srt",
    );
    expect(srt).toContain("1\n00:00:05,000 --> 00:00:08,000\nRepeat repeat");
    expect(srt).toContain("&lt;unsafe&gt;");
    expect(exportText(doc, all, defaults, "vtt")).toMatch(
      /^WEBVTT\n\n1\n00:00:00.000/,
    );
  });
  it("JSON includes version, selection and original timing but no acquisition data", () => {
    const json = JSON.parse(
      exportText(
        doc,
        { kind: "passages", segmentIds: ["cue-3"] },
        defaults,
        "json",
      ),
    );
    expect(json.schemaVersion).toBe("1.0");
    expect(json.segments).toEqual([doc.segments[3]]);
    expect(json).not.toHaveProperty("acquisitionRef");
  });
  it("templates expand once and reject unknown or executable placeholders", () => {
    expect(
      expandTemplate("{{title}} {{channel}}", {
        title: "{{channel}}",
        channel: "One",
      }),
    ).toBe("{{channel}} One");
    expect(() => validateTemplate("{{window.alert(1)}}")).toThrow();
    expect(() => validateTemplate("{{unknown}}")).toThrow();
  });
  it.each(["CON", "NUL.txt", "...", "a/b\\c:*?", "😀".repeat(200)])(
    "creates safe filename for %s",
    (title) => {
      const name = filename({ ...doc, title }, "md");
      expect(name).not.toMatch(/[<>:"/\\|?*]/);
      expect([...name].length).toBeLessThanOrEqual(123);
      expect(name).toMatch(/\.md$/);
    },
  );
  it("creates ZIP entries, collision-free source names and manifest", async () => {
    const bytes = await archive(
      [doc, { ...doc, videoId: "12345678901" }],
      defaults,
      "md",
      [{ videoId: doc.videoId, status: "completed" }],
    );
    const entries = unzipSync(bytes);
    expect(Object.keys(entries)).toHaveLength(3);
    expect(
      Object.keys(entries).every((n) => !n.includes("..") && !n.includes("/")),
    ).toBe(true);
    expect(strFromU8(entries["batch-manifest.json"]!)).toContain("completed");
  });
  it("combined documents preserve explicit attribution and heading hierarchy", () => {
    const out = combinedMarkdown([doc], defaults, 2);
    expect(out).toContain("1 of 2");
    expect(out).toContain(`Source: ${doc.sourceUrl}`);
    expect(out).toContain("### Opening");
  });
});
