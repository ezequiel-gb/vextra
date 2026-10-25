// @vitest-environment node
import { it, expect } from "vitest";
import { readFile } from "node:fs/promises";
import Ajv2020 from "ajv/dist/2020.js";
import { parseSync } from "subtitle";
import AdmZip from "adm-zip";
import { documentFixture as doc } from "../fixtures/document.ts";
import { defaults } from "../../src/model/types.ts";
import { exportText } from "../../src/export/formats.ts";
import { archive } from "../../src/export/batch.ts";
it.each(["srt", "vtt"] as const)(
  "independently parses %s cue counts and absolute timings",
  (format) => {
    const text = exportText(doc, { kind: "all" }, defaults, format);
    const cues = parseSync(text).filter((n) => n.type === "cue");
    expect(cues).toHaveLength(doc.segments.length);
    expect(cues.map((c) => [c.data.start, c.data.end])).toEqual(
      doc.segments.map((s) => [s.startMs, s.startMs + s.durationMs]),
    );
    expect(cues[0]?.data.text).toBe(doc.segments[0]?.text);
  },
);
it("independent ZIP implementation verifies archive integrity and files", async () => {
  const bytes = await archive([doc], defaults, "md", [
    { videoId: doc.videoId, status: "completed" },
  ]);
  const zip = new AdmZip(Buffer.from(bytes));
  expect(zip.test()).toBe(true);
  const entries = zip.getEntries();
  expect(entries).toHaveLength(2);
  expect(
    entries
      .find((e) => e.entryName.endsWith(".md"))
      ?.getData()
      .toString("utf8"),
  ).toContain("## Opening");
});
it("exported JSON validates against the delivered versioned JSON Schema", async () => {
  const schema = JSON.parse(
    await readFile(
      new URL("../../docs/transcript.schema.json", import.meta.url),
      "utf8",
    ),
  );
  const validate = new Ajv2020().compile(schema);
  expect(
    validate(JSON.parse(exportText(doc, { kind: "all" }, defaults, "json"))),
    JSON.stringify(validate.errors),
  ).toBe(true);
  expect(
    validate({
      ...JSON.parse(exportText(doc, { kind: "all" }, defaults, "json")),
      acquisitionRef: "secret",
    }),
  ).toBe(false);
});
