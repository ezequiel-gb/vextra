import type { Transcript } from "../model/types.ts";
import { VextraError } from "../model/errors.ts";
import { validatedTranscript } from "../model/validate.ts";
export type ItemStatus =
  | "pending"
  | "extracting"
  | "completed"
  | "no-accessible-transcript"
  | "failed"
  | "cancelled";
export interface BatchItem {
  videoId: string;
  sourceUrl: string;
  status: ItemStatus;
  attempts: number;
  error?: string;
  documentId?: string;
  language?: string;
  interrupted?: boolean;
}
export interface Batch {
  id: string;
  createdAt: number;
  updatedAt: number;
  cancelled: boolean;
  items: BatchItem[];
}
export interface Lease {
  key: "runner";
  owner: string;
  token: number;
  expires: number;
}
interface StoredDocument {
  id: string;
  expires: number;
  bytes: number;
  value: Transcript;
  sessionOnly?: boolean;
}
let connection: Promise<IDBDatabase> | undefined;
export function database(): Promise<IDBDatabase> {
  return (connection ??= new Promise((resolve, reject) => {
    const request = indexedDB.open("vextra", 1);
    request.onupgradeneeded = () => {
      const d = request.result;
      d.createObjectStore("meta", { keyPath: "key" });
      d.createObjectStore("batches", { keyPath: "id" });
      d.createObjectStore("documents", { keyPath: "id" });
    };
    request.onsuccess = () => {
      request.result.onversionchange = () => {
        request.result.close();
        connection = undefined;
      };
      resolve(request.result);
    };
    request.onerror = () => reject(new VextraError("STORAGE_FULL"));
  }));
}
function value<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}
function complete(tx: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onabort = tx.onerror = () => reject(new VextraError("STORAGE_FULL"));
  });
}
const stores = ["meta", "batches", "documents"];
function announce(cleared = false) {
  if (typeof BroadcastChannel === "undefined") return;
  const channel = new BroadcastChannel("vextra-data");
  channel.postMessage({ cleared });
  channel.close();
}
export async function acquire(owner: string): Promise<Lease> {
  const db = await database(),
    tx = db.transaction("meta", "readwrite"),
    done = complete(tx),
    store = tx.objectStore("meta");
  const previous = await value<Lease | undefined>(store.get("runner"));
  if (previous && previous.expires > Date.now() && previous.owner !== owner) {
    await done;
    throw new VextraError("BUSY");
  }
  const lease: Lease = {
    key: "runner",
    owner,
    token: (previous?.token ?? 0) + 1,
    expires: Date.now() + 15_000,
  };
  store.put(lease);
  await done;
  return lease;
}
async function assertLease(tx: IDBTransaction, lease: Lease) {
  const current = await value<Lease | undefined>(
    tx.objectStore("meta").get("runner"),
  );
  if (
    !current ||
    current.owner !== lease.owner ||
    current.token !== lease.token ||
    current.expires <= Date.now()
  )
    throw new VextraError("CANCELLED");
}
export async function renew(lease: Lease): Promise<void> {
  const db = await database(),
    tx = db.transaction("meta", "readwrite"),
    done = complete(tx);
  await assertLease(tx, lease);
  tx.objectStore("meta").put({ ...lease, expires: Date.now() + 15_000 });
  await done;
}
export async function release(lease: Lease) {
  const db = await database(),
    tx = db.transaction("meta", "readwrite"),
    done = complete(tx),
    store = tx.objectStore("meta");
  const current = await value<Lease | undefined>(store.get("runner"));
  if (current?.token === lease.token && current.owner === lease.owner)
    store.put({ ...current, expires: 0 });
  await done;
}
export async function latestBatch(): Promise<Batch | undefined> {
  const db = await database(),
    tx = db.transaction(["batches", "meta"]),
    all = await value<Batch[]>(tx.objectStore("batches").getAll()),
    lease = await value<Lease | undefined>(
      tx.objectStore("meta").get("runner"),
    );
  const batch = all.sort((a, b) => b.updatedAt - a.updatedAt)[0];
  if (batch && (!lease || lease.expires <= Date.now()))
    batch.items = batch.items.map((i) =>
      i.status === "extracting"
        ? { ...i, status: "pending", interrupted: true }
        : i,
    );
  return batch;
}
export async function commit(
  lease: Lease,
  batch?: Batch,
  document?: Transcript,
  retain = true,
): Promise<void> {
  if (document) await cleanup();
  const db = await database(),
    tx = db.transaction(stores, "readwrite"),
    done = complete(tx);
  await assertLease(tx, lease);
  if (batch) {
    const previous = await value<Batch | undefined>(
      tx.objectStore("batches").get(batch.id),
    );
    if (previous?.cancelled && !batch.cancelled)
      throw new VextraError("CANCELLED");
  }
  if (document && (retain || batch)) {
    document = validatedTranscript(document);
    const bytes = new TextEncoder().encode(JSON.stringify(document)).length;
    const existing = await value<StoredDocument[]>(
      tx.objectStore("documents").getAll(),
    );
    const documentId = document.documentId;
    const used = existing
      .filter((d) => d.id !== documentId)
      .reduce((sum, d) => sum + d.bytes, 0);
    if (used + bytes > 100 * 1024 * 1024) throw new VextraError("STORAGE_FULL");
    tx.objectStore("documents").put({
      id: document.documentId,
      value: document,
      bytes,
      expires: Date.now() + (batch ? 7 : 1) * 86400000,
      sessionOnly: !retain,
    } satisfies StoredDocument);
  }
  if (batch) tx.objectStore("batches").put(batch);
  await done;
  announce();
}
export async function getDocument(id: string): Promise<Transcript | undefined> {
  const db = await database();
  const raw = (
    await value<StoredDocument | undefined>(
      db.transaction("documents").objectStore("documents").get(id),
    )
  )?.value;
  return raw ? validatedTranscript(raw) : undefined;
}
export async function latestDocument(): Promise<Transcript | undefined> {
  const db = await database(),
    records = await value<StoredDocument[]>(
      db.transaction("documents").objectStore("documents").getAll(),
    );
  const raw = records
    .filter((r) => r.expires > Date.now())
    .sort((a, b) =>
      b.value.extractedAt.localeCompare(a.value.extractedAt),
    )[0]?.value;
  return raw ? validatedTranscript(raw) : undefined;
}
export async function cancelBatch(id: string): Promise<void> {
  const db = await database(),
    tx = db.transaction("batches", "readwrite"),
    done = complete(tx),
    store = tx.objectStore("batches"),
    batch = await value<Batch | undefined>(store.get(id));
  if (batch)
    store.put({
      ...batch,
      cancelled: true,
      updatedAt: Date.now(),
      items: batch.items.map((i) =>
        ["pending", "extracting"].includes(i.status)
          ? { ...i, status: "cancelled" }
          : i,
      ),
    });
  await done;
  announce();
}
export async function restartBatch(lease: Lease, batch: Batch): Promise<Batch> {
  const db = await database(),
    tx = db.transaction(["meta", "batches"], "readwrite"),
    done = complete(tx);
  await assertLease(tx, lease);
  const next: Batch = {
    ...batch,
    cancelled: false,
    updatedAt: Date.now(),
    items: batch.items.map((i) =>
      i.status === "completed"
        ? i
        : { ...i, status: "pending", error: undefined, interrupted: false },
    ),
  };
  tx.objectStore("batches").put(next);
  await done;
  return next;
}
export async function clearData() {
  const db = await database(),
    tx = db.transaction(stores, "readwrite"),
    done = complete(tx),
    store = tx.objectStore("meta");
  const lease = await value<Lease | undefined>(store.get("runner"));
  store.put({
    key: "runner",
    owner: "",
    token: (lease?.token ?? 0) + 1,
    expires: 0,
  });
  tx.objectStore("batches").clear();
  tx.objectStore("documents").clear();
  await done;
  announce(true);
}
export async function cleanup(): Promise<number> {
  const db = await database(),
    tx = db.transaction(stores, "readwrite"),
    done = complete(tx);
  const batches = await value<Batch[]>(tx.objectStore("batches").getAll());
  const documents = await value<StoredDocument[]>(
    tx.objectStore("documents").getAll(),
  );
  const lease = await value<Lease | undefined>(
    tx.objectStore("meta").get("runner"),
  );
  const ephemeralExpired = new Set(
    documents
      .filter((d) => d.sessionOnly && (!lease || lease.expires <= Date.now()))
      .map((d) => d.id),
  );
  const liveIds = new Set<string>();
  for (const batch of batches) {
    if (Date.now() - batch.createdAt > 7 * 86400000)
      tx.objectStore("batches").delete(batch.id);
    else {
      let changed = false;
      batch.items = batch.items.map((i) => {
        if (i.documentId && ephemeralExpired.has(i.documentId)) {
          changed = true;
          return {
            ...i,
            status: "failed",
            documentId: undefined,
            error:
              "This completed transcript was not retained. Retry extraction to obtain it again.",
          };
        }
        if (i.documentId) liveIds.add(i.documentId);
        return i;
      });
      if (changed) tx.objectStore("batches").put(batch);
    }
  }
  let bytes = 0;
  for (const d of documents) {
    if (
      ephemeralExpired.has(d.id) ||
      (d.expires < Date.now() && !liveIds.has(d.id))
    )
      tx.objectStore("documents").delete(d.id);
    else bytes += d.bytes;
  }
  await done;
  return bytes;
}
