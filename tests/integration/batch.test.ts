import "fake-indexeddb/auto";
import { afterEach, describe, it, expect, vi } from "vitest";
import { documentFixture as doc } from "../fixtures/document.ts";
import { defaults } from "../../src/model/types.ts";
import { VextraError } from "../../src/model/errors.ts";
import {
  clearData,
  getDocument,
  latestBatch,
  type Batch,
} from "../../src/persistence/database.ts";
import { runBatch, withRunner } from "../../src/batch/runner.ts";
import {
  discover,
  extract,
  chooseTrack,
} from "../../src/source/youtube/index.ts";
vi.mock("../../src/source/youtube/index.ts", () => ({
  discover: vi.fn(),
  extract: vi.fn(),
  chooseTrack: vi.fn(),
}));
afterEach(() => {
  vi.useRealTimers();
  vi.clearAllMocks();
});
describe("batch execution", () => {
  it("preserves successful results alongside failures and retries only unsuccessful items", async () => {
    await clearData();
    vi.mocked(discover).mockImplementation(async (url) => {
      if (url.includes("12345678901"))
        throw new VextraError("NO_CAPTION_TRACKS");
      return {
        videoId: doc.videoId,
        sourceUrl: doc.sourceUrl,
        tracks: [],
        chapters: [],
        adapterId: "test-only",
      };
    });
    vi.mocked(chooseTrack).mockReturnValue({
      id: "en-0",
      languageCode: "en",
      displayName: "English",
      captionType: "manual",
      acquisitionRef: "test-only",
    });
    vi.mocked(extract).mockResolvedValue(doc);
    const batch: Batch = {
      id: "mixed",
      createdAt: Date.now(),
      updatedAt: Date.now(),
      cancelled: false,
      items: [
        {
          videoId: doc.videoId,
          sourceUrl: doc.sourceUrl,
          status: "pending",
          attempts: 0,
        },
        {
          videoId: "12345678901",
          sourceUrl: "https://www.youtube.com/watch?v=12345678901",
          status: "pending",
          attempts: 0,
        },
      ],
    };
    const updates: Batch[] = [];
    const run = runBatch(batch, defaults, new AbortController().signal, (b) =>
      updates.push(b),
    );
    await run;
    const saved = (await latestBatch())!;
    expect(saved.items.map((i) => i.status)).toEqual([
      "completed",
      "no-accessible-transcript",
    ]);
    expect(await getDocument(doc.documentId)).toEqual(doc);
    expect(updates.some((b) => b.items[0]?.status === "extracting")).toBe(true);
    const retried = runBatch(
      saved,
      defaults,
      new AbortController().signal,
      () => undefined,
    );
    await retried;
    expect(extract).toHaveBeenCalledTimes(1);
    expect(discover).toHaveBeenCalledTimes(3);
  });
  it("prevents a second runner from acquiring work", async () => {
    await clearData();
    let unblock: () => void = () => undefined;
    let entered: () => void = () => undefined;
    const ready = new Promise<void>((r) => {
      entered = r;
    });
    const blocked = new Promise<void>((r) => {
      unblock = r;
    });
    const first = withRunner(new AbortController().signal, async () => {
      entered();
      await blocked;
    });
    await ready;
    await expect(
      withRunner(new AbortController().signal, async () => undefined),
    ).rejects.toThrow("Another Vextra");
    unblock();
    await first;
  });
});
