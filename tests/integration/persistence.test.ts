import "fake-indexeddb/auto";
import { describe, it, expect } from "vitest";
import {
  acquire,
  clearData,
  commit,
  getDocument,
  latestBatch,
  release,
  cancelBatch,
  restartBatch,
  cleanup,
  type Batch,
} from "../../src/persistence/database.ts";
import { documentFixture as doc } from "../fixtures/document.ts";
describe("transactional recovery and fencing", () => {
  it("rejects duplicate owners, preserves committed documents, and fences stale writers", async () => {
    await clearData();
    const lease = await acquire("one");
    await expect(acquire("two")).rejects.toThrow("Another Vextra");
    const batch: Batch = {
      id: "b",
      createdAt: Date.now(),
      updatedAt: Date.now(),
      cancelled: false,
      items: [
        {
          videoId: doc.videoId,
          sourceUrl: doc.sourceUrl,
          status: "completed",
          attempts: 1,
          documentId: doc.documentId,
        },
      ],
    };
    await commit(lease, batch, doc);
    expect(await getDocument(doc.documentId)).toEqual(doc);
    expect((await latestBatch())?.items[0]?.status).toBe("completed");
    await release(lease);
    const next = await acquire("two");
    await expect(
      commit(lease, undefined, { ...doc, documentId: "stale" }),
    ).rejects.toThrow("Cancelled");
    expect(await getDocument("stale")).toBeUndefined();
    await release(next);
  });
  it("durable cancellation prevents late success until an explicit restart", async () => {
    await clearData();
    const lease = await acquire("one");
    const batch: Batch = {
      id: "cancel",
      createdAt: Date.now(),
      updatedAt: Date.now(),
      cancelled: false,
      items: [
        {
          videoId: doc.videoId,
          sourceUrl: doc.sourceUrl,
          status: "extracting",
          attempts: 1,
        },
      ],
    };
    await commit(lease, batch);
    await cancelBatch(batch.id);
    await expect(
      commit(
        lease,
        { ...batch, items: [{ ...batch.items[0]!, status: "completed" }] },
        doc,
      ),
    ).rejects.toThrow("Cancelled");
    expect((await latestBatch())?.cancelled).toBe(true);
    const resumed = await restartBatch(lease, (await latestBatch())!);
    expect(resumed.items[0]?.status).toBe("pending");
    expect(resumed.cancelled).toBe(false);
    await release(lease);
  });
  it("marks abandoned claims interrupted and keeps completed items intact", async () => {
    await clearData();
    const lease = await acquire("one");
    await commit(lease, {
      id: "abandoned",
      createdAt: Date.now(),
      updatedAt: Date.now(),
      cancelled: false,
      items: [
        {
          videoId: doc.videoId,
          sourceUrl: doc.sourceUrl,
          status: "extracting",
          attempts: 1,
        },
      ],
    });
    await release(lease);
    expect((await latestBatch())?.items[0]).toMatchObject({
      status: "pending",
      interrupted: true,
    });
  });
  it("clear data invalidates running leases so results cannot reappear", async () => {
    await clearData();
    const lease = await acquire("one");
    await clearData();
    await expect(commit(lease, undefined, doc)).rejects.toThrow("Cancelled");
    expect(await getDocument(doc.documentId)).toBeUndefined();
  });
  it("does not persist single transcripts when retention is off", async () => {
    await clearData();
    const lease = await acquire("one");
    await commit(lease, undefined, doc, false);
    expect(await getDocument(doc.documentId)).toBeUndefined();
    expect(await cleanup()).toBe(0);
    await release(lease);
  });
  it("removes session-only completed batch documents on the next startup after release", async () => {
    await clearData();
    const lease = await acquire("one");
    const batch: Batch = {
      id: "session",
      createdAt: Date.now(),
      updatedAt: Date.now(),
      cancelled: false,
      items: [
        {
          videoId: doc.videoId,
          sourceUrl: doc.sourceUrl,
          status: "completed",
          attempts: 1,
          documentId: doc.documentId,
        },
      ],
    };
    await commit(lease, batch, doc, false);
    expect(await getDocument(doc.documentId)).toEqual(doc);
    await release(lease);
    await cleanup();
    expect(await getDocument(doc.documentId)).toBeUndefined();
    expect((await latestBatch())?.items[0]?.status).toBe("failed");
  });
});
