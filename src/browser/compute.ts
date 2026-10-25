import type { ComputeRequest } from "../workers/compute.ts";
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
      worker.terminate();
      reject(new DOMException("Aborted", "AbortError"));
    };
    if (signal?.aborted) {
      abort();
      return;
    }
    signal?.addEventListener("abort", abort, { once: true });
    const finish = () => {
      signal?.removeEventListener("abort", abort);
      worker.terminate();
    };
    worker.onmessage = (e) => {
      if (e.data.id !== id) return;
      finish();
      if (e.data.error) reject(new Error(e.data.error));
      else resolve(e.data.data as T);
    };
    worker.onerror = () => {
      finish();
      reject(new Error("Document processing failed."));
    };
    worker.postMessage({ ...request, id });
  });
}
