import { expect, it, vi } from "vitest";
import { extract } from "../../src/source/youtube/index.ts";
import { nativeTranscript } from "../../src/browser/platform.ts";
import type { Discovery } from "../../src/model/types.ts";
vi.mock("../../src/source/youtube/request.ts", () => ({
  youtubeRequest: vi.fn().mockResolvedValue(""),
}));
vi.mock("../../src/browser/platform.ts", () => ({
  nativeTranscript: vi.fn(),
  playerSnapshot: vi.fn(),
}));
const source: Discovery = {
  videoId: "abcdefghijk",
  sourceUrl: "https://www.youtube.com/watch?v=abcdefghijk",
  durationMs: 3000,
  tracks: [
    {
      id: "en",
      languageCode: "en",
      displayName: "English",
      captionType: "manual",
      acquisitionRef: "https://www.youtube.com/api/timedtext?lang=en",
    },
  ],
  chapters: [],
  adapterId: "test",
};
const payload = JSON.stringify({
  events: [{ tStartMs: 0, segs: [{ utf8: "Original test caption." }] }],
});
it("keeps native panel text without asserting an unidentified language or caption type", async () => {
  vi.mocked(nativeTranscript).mockResolvedValue({
    payload,
    languageVerified: false,
  });
  const doc = await extract(source, "en", new AbortController().signal, 1);
  expect(doc.language).toBe("und");
  expect(doc.captionType).toBe("unknown");
  expect(doc.segments[0]?.text).toBe("Original test caption.");
  expect(doc.warnings).toContain("NATIVE_LANGUAGE_UNKNOWN");
  expect(nativeTranscript).toHaveBeenCalledWith(
    1,
    source.videoId,
    "English",
    false,
    true,
    true,
  );
});
it("preserves verified track metadata in the existing native workflow", async () => {
  vi.mocked(nativeTranscript).mockResolvedValue({
    payload,
    languageVerified: true,
  });
  const doc = await extract(source, "en", new AbortController().signal, 1);
  expect(doc.language).toBe("en");
  expect(doc.captionType).toBe("manual");
  expect(doc.warnings).not.toContain("NATIVE_LANGUAGE_UNKNOWN");
});
