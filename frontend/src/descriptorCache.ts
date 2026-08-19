/** Offline store for card descriptor chunks.
 *
 * The scanner exists for a vendor booth, where the wifi is the problem — so
 * needing the network at scan time would make it fail exactly when it is
 * wanted. Descriptors are therefore downloaded once (chunked, resumable) and
 * kept in IndexedDB, after which matching is fully offline.
 *
 * Chunks are stored as raw bytes rather than parsed structures: the parsed
 * form contains OpenCV matrices, which are WASM heap handles and cannot be
 * serialised. Parsing happens on load instead.
 */

const DB_NAME = "optcg-scan";
const DB_VERSION = 1;
const STORE = "descriptor-chunks";
/** Records which manifest version the stored chunks belong to. */
const META_STORE = "meta";

export type DescriptorRecordMeta = {
  label: string;
  cardId: string;
  offset: number;
  length: number;
};

export type DescriptorChunkMeta = {
  /** Content-addressed: the filename contains the hash of the bytes. */
  file: string;
  hash: string;
  bytes: number;
  records: DescriptorRecordMeta[];
};

export type DescriptorManifest = {
  /** Changes only on a format change; content changes are per-chunk. */
  formatVersion: string;
  features: number;
  totalRecords: number;
  totalBytes: number;
  chunks: DescriptorChunkMeta[];
};

/** One card's features, as stored: descriptors plus flat x,y pairs. */
export type DescriptorRecord = {
  label: string;
  cardId: string;
  /** Precomputed ordering hash — hashing thousands of references at load
   *  time would cost far more than the matching it is meant to save. */
  orderHash: string;
  width: number;
  height: number;
  points: Uint16Array;
  descriptors: Uint8Array;
};

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE);
      if (!db.objectStoreNames.contains(META_STORE)) db.createObjectStore(META_STORE);
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function idbGet<T>(db: IDBDatabase, store: string, key: string): Promise<T | undefined> {
  return new Promise((resolve, reject) => {
    const req = db.transaction(store, "readonly").objectStore(store).get(key);
    req.onsuccess = () => resolve(req.result as T | undefined);
    req.onerror = () => reject(req.error);
  });
}

function idbPut(db: IDBDatabase, store: string, key: string, value: unknown): Promise<void> {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(store, "readwrite");
    tx.objectStore(store).put(value, key);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

function idbClear(db: IDBDatabase, store: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(store, "readwrite");
    tx.objectStore(store).clear();
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

export type DownloadProgress = {
  chunksDone: number;
  chunksTotal: number;
  bytesDone: number;
  bytesTotal: number;
  fromCache: number;
};

function idbDelete(db: IDBDatabase, store: string, key: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(store, "readwrite");
    tx.objectStore(store).delete(key);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

function idbKeys(db: IDBDatabase, store: string): Promise<string[]> {
  return new Promise((resolve, reject) => {
    const req = db.transaction(store, "readonly").objectStore(store).getAllKeys();
    req.onsuccess = () => resolve(req.result as string[]);
    req.onerror = () => reject(req.error);
  });
}

/**
 * Ask the browser to keep this data through storage pressure.
 *
 * Without it IndexedDB is "best effort" and can be evicted, which for a
 * multi-megabyte descriptor set means a silent re-download — the exact cost
 * caching exists to avoid. Returns whether persistence is granted; browsers
 * may refuse, so this is a request rather than a guarantee.
 */
export async function requestPersistentStorage(): Promise<boolean> {
  if (!navigator.storage?.persist) return false;
  if (await navigator.storage.persisted?.()) return true;
  try {
    return await navigator.storage.persist();
  } catch {
    return false;
  }
}

/**
 * Ensure every chunk in `manifest` is present locally, fetching only what is
 * missing. Safe to call repeatedly — an interrupted download resumes rather
 * than restarting, which is the point of chunking.
 */
export async function ensureDescriptors(
  manifest: DescriptorManifest,
  baseUrl: string,
  onProgress?: (p: DownloadProgress) => void,
): Promise<void> {
  await requestPersistentStorage();
  const db = await openDb();
  const storedFormat = await idbGet<string>(db, META_STORE, "formatVersion");
  // Only a *format* change wipes everything — descriptors built with a
  // different feature count are not comparable. Content changes (new cards
  // each sync) are handled per chunk below, so adding one card does not cost
  // a full re-download.
  if (storedFormat !== manifest.formatVersion) {
    await idbClear(db, STORE);
    await idbPut(db, META_STORE, "formatVersion", manifest.formatVersion);
  }

  let bytesDone = 0;
  let fromCache = 0;
  for (let i = 0; i < manifest.chunks.length; i += 1) {
    const chunk = manifest.chunks[i];
    const existing = await idbGet<ArrayBuffer>(db, STORE, chunk.file);
    if (existing && existing.byteLength === chunk.bytes) {
      bytesDone += chunk.bytes;
      fromCache += 1;
    } else {
      const res = await fetch(`${baseUrl}/${chunk.file}`);
      if (!res.ok) throw new Error(`chunk ${chunk.file} failed: HTTP ${res.status}`);
      const buf = await res.arrayBuffer();
      await idbPut(db, STORE, chunk.file, buf);
      bytesDone += buf.byteLength;
    }
    onProgress?.({
      chunksDone: i + 1,
      chunksTotal: manifest.chunks.length,
      bytesDone,
      bytesTotal: manifest.totalBytes,
      fromCache,
    });
  }

  // Superseded chunks keep their old (content-addressed) keys forever
  // otherwise, so the cache would grow with every catalog change.
  const live = new Set(manifest.chunks.map((c) => c.file));
  for (const key of await idbKeys(db, STORE)) {
    if (!live.has(key)) await idbDelete(db, STORE, key);
  }
  db.close();
}

/** Decode one record from a chunk's bytes at `offset`. */
export function decodeRecord(buf: ArrayBuffer, offset: number, cardId: string): DescriptorRecord {
  const view = new DataView(buf);
  const bytes = new Uint8Array(buf);
  let o = offset;
  const labelLen = view.getUint16(o, true);
  o += 2;
  const label = new TextDecoder().decode(bytes.subarray(o, o + labelLen));
  o += labelLen;
  const hashLen = view.getUint16(o, true);
  o += 2;
  const orderHash = new TextDecoder().decode(bytes.subarray(o, o + hashLen));
  o += hashLen;
  const width = view.getUint16(o, true);
  o += 2;
  const height = view.getUint16(o, true);
  o += 2;
  const n = view.getUint16(o, true);
  o += 2;
  // Copy rather than subarray-view: the points are read per candidate during
  // matching, and a copy keeps that independent of the chunk buffer's life.
  const points = new Uint16Array(n * 2);
  for (let i = 0; i < n * 2; i += 1) {
    points[i] = view.getUint16(o, true);
    o += 2;
  }
  const descriptors = bytes.subarray(o, o + n * 32);
  return { label, cardId, orderHash, width, height, points, descriptors };
}

/** Read every cached record. Throws if a chunk is missing — call `ensureDescriptors` first. */
export async function loadAllRecords(manifest: DescriptorManifest): Promise<DescriptorRecord[]> {
  const db = await openDb();
  const out: DescriptorRecord[] = [];
  for (const chunk of manifest.chunks) {
    const buf = await idbGet<ArrayBuffer>(db, STORE, chunk.file);
    if (!buf) {
      db.close();
      throw new Error(`chunk ${chunk.file} not cached`);
    }
    for (const rec of chunk.records) out.push(decodeRecord(buf, rec.offset, rec.cardId));
  }
  db.close();
  return out;
}

/** Bytes currently held, for a "downloaded / not downloaded" indicator. */
export async function cachedBytes(manifest: DescriptorManifest): Promise<number> {
  const db = await openDb();
  const storedFormat = await idbGet<string>(db, META_STORE, "formatVersion");
  if (storedFormat !== manifest.formatVersion) {
    db.close();
    return 0;
  }
  let total = 0;
  for (const chunk of manifest.chunks) {
    const buf = await idbGet<ArrayBuffer>(db, STORE, chunk.file);
    if (buf) total += buf.byteLength;
  }
  db.close();
  return total;
}
