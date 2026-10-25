import type { ComputeRequest } from "../workers/compute.ts";
import { VextraError } from "../model/errors.ts";
type Request = ComputeRequest extends infer T
  ? T extends { id: number }
    ? Omit<T, "id">
    : never
  : never;
let sequence = 0;
/** Terminating superseded jobs prevents stale previews and searches from blocking the next job. */
export function compute<T>(request: Request, signal?: AbortSignal): Promise<T> {
  return new Promise((resolve, reject) => {
    const worker = new Worker(
      new URL("../workers/compute.ts", import.meta.url),
      { type: "module" },
    );
    const id = ++sequence;
    const abort = () => {
      finish();
      reject(new DOMException("Aborted", "AbortError"));
    };
    const finish = () => {
      signal?.removeEventListener("abort", abort);
      worker.terminate();
    };
    if (signal?.aborted) {
      abort();
      return;
    }
    signal?.addEventListener("abort", abort, { once: true });
    worker.onmessage = (e) => {
      if (e.data.id !== id) return;
      finish();
      if (e.data.error)
        reject(
          e.data.code
            ? new VextraError(e.data.code)
            : new VextraError("EXPORT_FAILED"),
        );
      else resolve(e.data.data as T);
    };
    worker.onerror = () => {
      finish();
      reject(new Error("Document processing failed."));
    };
    worker.postMessage({ ...request, id });
  });
}
