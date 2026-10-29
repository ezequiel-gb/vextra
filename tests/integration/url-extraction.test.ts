import { beforeEach, expect, it, vi } from "vitest";
import { extract } from "../../src/source/youtube/index.ts";
import { youtubeRequest } from "../../src/source/youtube/request.ts";
import {
  nativeTranscript,
  playerSnapshot,
} from "../../src/browser/platform.ts";
import { withSourceTab } from "../../src/browser/source-tab.ts";
import { VextraError } from "../../src/model/errors.ts";
import type { Discovery } from "../../src/model/types.ts";
vi.mock("../../src/source/youtube/request.ts", () => ({
  youtubeRequest: vi.fn(),
}));
vi.mock("../../src/browser/platform.ts", () => ({
  nativeTranscript: vi.fn(),
  playerSnapshot: vi.fn(),
}));
vi.mock("../../src/browser/source-tab.ts", () => ({ withSourceTab: vi.fn() }));
const source: Discovery = {
  videoId: "abcdefghijk",
  sourceUrl: "https://www.youtube.com/watch?v=abcdefghijk",
  durationMs: 5000,
  tracks: [
    {
      id: "en",
      languageCode: "en",
      displayName: "English",
      captionType: "automatic",
      acquisitionRef: "https://www.youtube.com/api/timedtext?lang=en",
    },
  ],
  chapters: [],
  adapterId: "test",
};
const payload = JSON.stringify({
  events: [
    {
      tStartMs: 0,
      dDurationMs: 5000,
      segs: [{ utf8: "Meaningful caption fixture." }],
    },
  ],
});
beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(youtubeRequest).mockResolvedValue("");
  vi.mocked(withSourceTab).mockImplementation(async (_id, _signal, operation) =>
    operation(7),
  );
  vi.mocked(playerSnapshot).mockResolvedValue({
    player: {
      videoDetails: { videoId: source.videoId, lengthSeconds: "5" },
      playabilityStatus: { status: "OK" },
      captions: {
        playerCaptionsTracklistRenderer: {
          captionTracks: [
            {
              baseUrl: source.tracks[0]!.acquisitionRef,
              languageCode: "en",
              kind: "asr",
              name: { simpleText: "English" },
            },
          ],
        },
      },
    },
    initial: {},
  });
  vi.mocked(nativeTranscript).mockResolvedValue({
    payload,
    languageVerified: true,
  });
});
it("uses the same native reader for a pasted URL after an empty direct response", async () => {
  const doc = await extract(source, "en", new AbortController().signal);
  expect(withSourceTab).toHaveBeenCalledWith(
    source.videoId,
    expect.any(AbortSignal),
    expect.any(Function),
  );
  expect(nativeTranscript).toHaveBeenCalledWith(
    7,
    source.videoId,
    "English",
    true,
    true,
    true,
  );
  expect(doc.segments[0]?.text).toBe("Meaningful caption fixture.");
  expect(doc.captionType).toBe("automatic");
});
it("keeps Current Video on its existing tab without creating a temporary tab", async () => {
  expect(
    (await extract(source, "en", new AbortController().signal, 9)).segments,
  ).toHaveLength(1);
  expect(withSourceTab).not.toHaveBeenCalled();
  expect(nativeTranscript).toHaveBeenCalledWith(
    9,
    source.videoId,
    "English",
    true,
    true,
    true,
  );
});
it("avoids a browser page when a direct manual caption request succeeds", async () => {
  vi.mocked(youtubeRequest).mockResolvedValue(payload);
  const doc = await extract(
    { ...source, tracks: [{ ...source.tracks[0]!, captionType: "manual" }] },
    "en",
    new AbortController().signal,
  );
  expect(doc.captionType).toBe("manual");
  expect(withSourceTab).not.toHaveBeenCalled();
});
it("does not substitute a different language when refreshed tracks change", async () => {
  const snapshot = await vi.mocked(playerSnapshot)(7, source.videoId);
  const player = snapshot.player as {
    captions: {
      playerCaptionsTracklistRenderer: {
        captionTracks: { languageCode: string }[];
      };
    };
  };
  player.captions.playerCaptionsTracklistRenderer.captionTracks[0]!.languageCode =
    "fr";
  await expect(
    extract(source, "en", new AbortController().signal),
  ).rejects.toMatchObject({ code: "SELECTED_TRACK_UNAVAILABLE" });
  expect(nativeTranscript).not.toHaveBeenCalled();
});
it("reports temporary-page permission failures and can retry successfully", async () => {
  vi.mocked(withSourceTab).mockRejectedValueOnce(
    new VextraError("PERMISSION_REQUIRED"),
  );
  await expect(
    extract(source, "en", new AbortController().signal),
  ).rejects.toMatchObject({ code: "PERMISSION_REQUIRED" });
  expect(
    (await extract(source, "en", new AbortController().signal)).segments,
  ).toHaveLength(1);
});
it("never accepts an empty native result or unexpected direct format", async () => {
  vi.mocked(nativeTranscript).mockResolvedValue({
    payload: "",
    languageVerified: true,
  });
  await expect(
    extract(source, "en", new AbortController().signal),
  ).rejects.toMatchObject({ code: "EMPTY_TRANSCRIPT" });
  vi.mocked(youtubeRequest).mockResolvedValue("<html>not captions</html>");
  await expect(
    extract(source, "en", new AbortController().signal),
  ).rejects.toBeInstanceOf(VextraError);
});
it("rejects invalid caption resource URLs before any network call", async () => {
  await expect(
    extract(
      {
        ...source,
        tracks: [
          {
            ...source.tracks[0]!,
            acquisitionRef: "https://evil.test/api/timedtext",
          },
        ],
      },
      "en",
      new AbortController().signal,
    ),
  ).rejects.toBeInstanceOf(VextraError);
  expect(youtubeRequest).not.toHaveBeenCalled();
});

it("uses the selected manual track in the refreshed browser context", async () => {
  const snapshot = await vi.mocked(playerSnapshot)(7, source.videoId);
  const player = snapshot.player as {
    captions: {
      playerCaptionsTracklistRenderer: { captionTracks: { kind?: string }[] };
    };
  };
  delete player.captions.playerCaptionsTracklistRenderer.captionTracks[0]!.kind;
  const manual = {
    ...source,
    tracks: [{ ...source.tracks[0]!, captionType: "manual" as const }],
  };
  const doc = await extract(manual, "en", new AbortController().signal);
  expect(doc.captionType).toBe("manual");
  expect(nativeTranscript).toHaveBeenCalledWith(
    7,
    source.videoId,
    "English",
    false,
    true,
    true,
  );
});
