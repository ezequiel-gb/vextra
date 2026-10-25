import { afterEach, expect, it, vi } from "vitest";
import { readPlayer } from "../../src/content/read-player.ts";
afterEach(() => vi.unstubAllGlobals());
it("returns only the known player and chapter fields", () => {
  vi.stubGlobal("window", {
    ytInitialPlayerResponse: {
      videoDetails: { videoId: "abcdefghijk" },
      captions: {},
      playabilityStatus: { status: "OK" },
      privateContext: "not-exported",
    },
    ytInitialData: { engagementPanels: [], privateContext: "not-exported" },
  });
  expect(JSON.stringify(readPlayer())).not.toContain("not-exported");
  expect(readPlayer()?.player.videoDetails).toEqual({ videoId: "abcdefghijk" });
});
it("rejects snapshots exceeding the UTF-8 limit even when their character count fits", () => {
  vi.stubGlobal("window", {
    ytInitialPlayerResponse: {
      videoDetails: { title: "界".repeat(1_100_000) },
    },
  });
  expect(readPlayer()).toBeNull();
});
