import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { readNativeTranscript } from "../../src/content/read-transcript.ts";
const input = {
  videoId: "h3mRsvFmWi0",
  label: "English",
  automatic: false,
  uniqueLabel: true,
};
beforeEach(() => {
  vi.useFakeTimers();
  vi.stubGlobal(
    "location",
    new URL("https://www.youtube.com/watch?v=h3mRsvFmWi0"),
  );
  vi.spyOn(HTMLElement.prototype, "getClientRects").mockReturnValue([
    {} as DOMRect,
  ] as unknown as DOMRectList);
  window.scrollTo = vi.fn();
  document.body.innerHTML = "";
});
afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  document.body.innerHTML = "";
});
it("reads complete original timed entries from a verified-language native list", async () => {
  document.body.innerHTML =
    "<ytd-transcript-renderer><ytd-transcript-footer-renderer><button>English</button></ytd-transcript-footer-renderer><ytd-transcript-segment-list-renderer></ytd-transcript-segment-list-renderer></ytd-transcript-renderer>";
  const list = document.querySelector(
    "ytd-transcript-segment-list-renderer",
  ) as HTMLElement & { data: unknown };
  list.data = {
    initialSegments: [
      {
        transcriptSegmentRenderer: {
          startMs: "1250",
          endMs: "3000",
          snippet: {
            runs: [{ text: "Actual " }, { text: "caption fixture." }],
          },
        },
      },
    ],
  };
  const task = readNativeTranscript(input);
  await vi.advanceTimersByTimeAsync(1500);
  const result = await task;
  expect(result.payload && JSON.parse(result.payload).events).toEqual([
    {
      tStartMs: 1250,
      dDurationMs: 1750,
      segs: [{ utf8: "Actual caption fixture." }],
    },
  ]);
});
it("automatically expands the description and clicks the native transcript control", async () => {
  document.body.innerHTML =
    '<ytd-watch-metadata><button id="expand">more</button></ytd-watch-metadata><ytd-video-description-transcript-section-renderer><button>Show transcript</button></ytd-video-description-transcript-section-renderer>';
  const expand = vi.fn(),
    open = vi.fn();
  document.querySelector("#expand")?.addEventListener("click", expand);
  document
    .querySelector("ytd-video-description-transcript-section-renderer button")
    ?.addEventListener("click", open);
  const task = readNativeTranscript(input);
  await vi.advanceTimersByTimeAsync(26000);
  expect((await task).error).toBe("NATIVE_TRANSCRIPT_UNAVAILABLE");
  expect(expand).toHaveBeenCalledOnce();
  expect(open).toHaveBeenCalledOnce();
});
it("never returns a partial DOM-only list as a complete transcript", async () => {
  document.body.innerHTML =
    '<ytd-transcript-renderer><ytd-transcript-footer-renderer><button>English</button></ytd-transcript-footer-renderer><ytd-transcript-segment-renderer><span class="segment-timestamp">00:01</span><span class="segment-text">Partial only</span></ytd-transcript-segment-renderer></ytd-transcript-renderer>';
  const task = readNativeTranscript(input);
  await vi.advanceTimersByTimeAsync(26000);
  expect(await task).toEqual({ error: "NATIVE_TRANSCRIPT_UNAVAILABLE" });
});
it("rejects stale video identity without touching the page", async () => {
  expect(
    await readNativeTranscript({ ...input, videoId: "abcdefghijk" }),
  ).toEqual({ error: "UNSUPPORTED_PAGE" });
});
