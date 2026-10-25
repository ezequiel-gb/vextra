import type { Settings, Transcript } from "../model/types.ts";
import { VextraError, errorText } from "../model/errors.ts";
import { discover, extract, chooseTrack } from "../source/youtube/index.ts";
import {
  acquire,
  renew,
  release,
  commit,
  latestBatch,
  restartBatch,
  type Batch,
  type Lease,
} from "../persistence/database.ts";

export async function withRunner<T>(
  signal: AbortSignal,
  operation: (lease: Lease, signal: AbortSignal) => Promise<T>,
): Promise<T> {
  const lease = await acquire(crypto.randomUUID()),
    controller = new AbortController();
  const combined = AbortSignal.any([signal, controller.signal]);
  const interval = setInterval(() => {
    void renew(lease).catch(() => controller.abort());
  }, 4000);
  try {
    return await operation(lease, combined);
  } finally {
    clearInterval(interval);
    await release(lease);
  }
}
export function wait(ms: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    signal.throwIfAborted();
    const cancel = () => {
      clearTimeout(timer);
      reject(new VextraError("CANCELLED"));
    };
    const timer = setTimeout(() => {
      signal.removeEventListener("abort", cancel);
      resolve();
    }, ms);
    signal.addEventListener("abort", cancel, { once: true });
  });
}
export async function runBatch(
  original: Batch,
  settings: Settings,
  signal: AbortSignal,
  update: (batch: Batch) => void,
): Promise<void> {
  await withRunner(signal, async (lease, runnerSignal) => {
    const batch = await restartBatch(lease, original);
    update(structuredClone(batch));
    for (const item of batch.items) {
      if (item.status === "completed") continue;
      runnerSignal.throwIfAborted();
      const durable = await latestBatch();
      if (durable?.id === batch.id && durable.cancelled)
        throw new VextraError("CANCELLED");
      item.status = "extracting";
      batch.updatedAt = Date.now();
      await commit(lease, batch);
      update(structuredClone(batch));
      const deadline = AbortSignal.any([
        runnerSignal,
        AbortSignal.timeout(90_000),
      ]);
      let document: Transcript | undefined;
      for (let attempt = 0; attempt < 3; attempt++) {
        item.attempts++;
        try {
          const d = await discover(item.sourceUrl, deadline);
          const track = chooseTrack(d, settings);
          item.language = track.languageCode;
          document = await extract(d, track.id, deadline);
          item.status = "completed";
          item.error = undefined;
          item.documentId = document.documentId;
          break;
        } catch (e) {
          if (runnerSignal.aborted) throw new VextraError("CANCELLED");
          if (e instanceof VextraError && e.code === "RATE_LIMITED") {
            item.status = "failed";
            item.error = e.message;
            batch.updatedAt = Date.now();
            await commit(lease, batch);
            update(structuredClone(batch));
            throw e;
          }
          if (
            attempt < 2 &&
            e instanceof VextraError &&
            ["NETWORK", "TIMEOUT"].includes(e.code) &&
            !deadline.aborted
          ) {
            await wait(2000 * 2 ** attempt + Math.random() * 300, deadline);
            continue;
          }
          item.status =
            e instanceof VextraError &&
            ["NO_CAPTION_TRACKS", "EMPTY_TRANSCRIPT"].includes(e.code)
              ? "no-accessible-transcript"
              : "failed";
          item.error = errorText(e);
          break;
        }
      }
      batch.updatedAt = Date.now();
      await commit(lease, batch, document, settings.retain);
      update(structuredClone(batch));
      await wait(1000, runnerSignal);
    }
  });
}
