import type { Transcript } from "../../src/model/types.ts";
/** Synthetic fixture; never imported by production modules. */
export const documentFixture: Transcript = {
  schemaVersion: "1.0",
  documentId: "fixture",
  videoId: "abcdefghijk",
  sourceUrl: "https://www.youtube.com/watch?v=abcdefghijk",
  title: "Test <script> & [title]",
  channel: "Research / Channel",
  durationMs: 30000,
  language: "en",
  captionType: "manual",
  trackId: "en-0",
  extractedAt: "2026-10-25T00:00:00.000Z",
  warnings: [],
  chapters: [
    {
      id: "chapter-0",
      title: "Opening",
      startMs: 0,
      endMs: 10000,
      provenance: "youtube-chapter-metadata",
    },
    {
      id: "chapter-10000",
      title: "Details",
      startMs: 10000,
      endMs: 30000,
      provenance: "youtube-chapter-metadata",
    },
  ],
  segments: [
    { id: "cue-0", startMs: 0, durationMs: 2000, text: "Hello world." },
    {
      id: "cue-1",
      startMs: 2500,
      durationMs: 4000,
      text: "Repeat repeat, preserve meaning.",
    },
    {
      id: "cue-2",
      startMs: 5000,
      durationMs: 3000,
      text: "Repeat repeat, preserve meaning.",
    },
    {
      id: "cue-3",
      startMs: 10000,
      durationMs: 2500,
      text: "日本語 مرحبا 😀 é & <unsafe>.",
    },
    {
      id: "cue-4",
      startMs: 13000,
      durationMs: 1000,
      text: "Literal {{title}} stays literal.",
    },
  ],
};
