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

function modernFixture() {
  document.body.innerHTML =
    '<ytd-engagement-panel-section-list-renderer><input aria-label="Search transcript"><transcript-segment-view-model></transcript-segment-view-model></ytd-engagement-panel-section-list-renderer>';
  const items = [0, 12, 192].map((seconds, index) => ({
    macroMarkersPanelItemViewModel: {
      index,
      panelId: "PAmodern_transcript_view",
      item: {
        timelineItemViewModel: {
          contentItems: [
            {
              transcriptSegmentViewModel: {
                simpleText: `Modern fixture passage ${index}.`,
              },
            },
          ],
        },
      },
      onTap: {
        innertubeCommand: {
          watchEndpoint: { videoId: input.videoId, startTimeSeconds: seconds },
        },
      },
    },
  }));
  const panel = document.querySelector(
    "ytd-engagement-panel-section-list-renderer",
  ) as HTMLElement & { data: unknown };
  panel.data = {
    content: {
      sectionListRenderer: {
        contents: [{ itemSectionRenderer: { contents: items } }],
      },
    },
  };
  return items;
}
it("reads the complete modern model, including entries not mounted in the DOM", async () => {
  modernFixture();
  const task = readNativeTranscript({ ...input, singleTrack: true });
  await vi.advanceTimersByTimeAsync(1500);
  const result = await task;
  expect(result.languageVerified).toBe(false);
  expect(
    JSON.parse(result.payload!).events.map(
      (e: { tStartMs: number }) => e.tStartMs,
    ),
  ).toEqual([0, 12000, 192000]);
});
it("does not mistake a filtered modern panel for a full transcript", async () => {
  modernFixture();
  document.querySelector("input")!.value = "fixture";
  expect(await readNativeTranscript({ ...input, singleTrack: true })).toEqual({
    error: "NATIVE_FILTER_ACTIVE",
  });
});
it("rejects missing modern indices and foreign-video entries", async () => {
  const items = modernFixture();
  items[1]!.macroMarkersPanelItemViewModel.index = 3;
  expect(await readNativeTranscript({ ...input, singleTrack: true })).toEqual({
    error: "NATIVE_TRANSCRIPT_UNAVAILABLE",
  });
  items[1]!.macroMarkersPanelItemViewModel.index = 1;
  items[1]!.macroMarkersPanelItemViewModel.onTap.innertubeCommand.watchEndpoint.videoId =
    "abcdefghijk";
  expect(await readNativeTranscript({ ...input, singleTrack: true })).toEqual({
    error: "NATIVE_TRANSCRIPT_UNAVAILABLE",
  });
});
it("reads an unlabelled modern panel on a multilingual video without claiming the selected language", async () => {
  modernFixture();
  const task = readNativeTranscript({ ...input, singleTrack: false });
  await vi.advanceTimersByTimeAsync(1500);
  const result = await task;
  expect(result.error).toBeUndefined();
  expect(result.languageVerified).toBe(false);
  expect(JSON.parse(result.payload!).events).toHaveLength(3);
});
it("counts chapter headers in the modern index sequence without treating them as captions", async () => {
  const items = modernFixture();
  for (const item of items) item.macroMarkersPanelItemViewModel.index++;
  const header = (index: number, startTimeSeconds: number, title: string) => ({
    macroMarkersPanelItemViewModel: {
      index,
      panelId: "PAmodern_transcript_view",
      item: { timelineChapterViewModel: { title } },
      onTap: {
        innertubeCommand: {
          watchEndpoint: { videoId: input.videoId, startTimeSeconds },
        },
      },
    },
  });
  const last = structuredClone(items[0]!);
  last.macroMarkersPanelItemViewModel.index = 5;
  last.macroMarkersPanelItemViewModel.onTap.innertubeCommand.watchEndpoint.startTimeSeconds = 205;
  const groups = [
    {
      itemSectionRenderer: {
        header: header(0, 0, "First chapter"),
        contents: items,
      },
    },
    {
      itemSectionRenderer: {
        header: header(4, 200, "Second chapter"),
        contents: [last],
      },
    },
  ];
  const panel = document.querySelector(
    "ytd-engagement-panel-section-list-renderer",
  ) as HTMLElement & { data: unknown };
  panel.data = { content: { sectionListRenderer: { contents: groups } } };
  const task = readNativeTranscript({ ...input, singleTrack: true });
  await vi.advanceTimersByTimeAsync(1500);
  const result = await task;
  expect(
    JSON.parse(result.payload!).events.map(
      (e: { tStartMs: number }) => e.tStartMs,
    ),
  ).toEqual([0, 12000, 192000, 205000]);
  expect(result.payload).not.toContain("First chapter");
  groups[1]!.itemSectionRenderer.header.macroMarkersPanelItemViewModel.onTap.innertubeCommand.watchEndpoint.videoId =
    "abcdefghijk";
  expect(await readNativeTranscript({ ...input, singleTrack: true })).toEqual({
    error: "NATIVE_TRANSCRIPT_UNAVAILABLE",
  });
});
it("opens the modern panel through the normal Show transcript control", async () => {
  document.body.innerHTML =
    "<ytd-video-description-transcript-section-renderer><button>Show transcript</button></ytd-video-description-transcript-section-renderer>";
  document.querySelector("button")!.addEventListener("click", modernFixture);
  const task = readNativeTranscript({ ...input, singleTrack: true });
  await vi.advanceTimersByTimeAsync(1800);
  expect(JSON.parse((await task).payload!).events).toHaveLength(3);
});
it("rejects modern continuation records rather than returning partial success", async () => {
  modernFixture();
  const panel = document.querySelector(
    "ytd-engagement-panel-section-list-renderer",
  ) as HTMLElement & {
    data: { content: { sectionListRenderer: { continuations?: unknown[] } } };
  };
  panel.data.content.sectionListRenderer.continuations = [{}];
  expect(await readNativeTranscript({ ...input, singleTrack: true })).toEqual({
    error: "NATIVE_TRANSCRIPT_UNAVAILABLE",
  });
});
