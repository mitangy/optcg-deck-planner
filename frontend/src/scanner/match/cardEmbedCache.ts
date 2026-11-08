/** Offline store for the card-art embedder and its precomputed embeddings (#701).
 *
 * Same shape as `cardDetectorCache.ts`: build artifacts served from the
 * `scan-data/` store next to the descriptors, kept in IndexedDB so scanning
 * stays offline after one download, in their own tiny database so they cannot
 * disturb the descriptor cache's versioning.
 *
 * `card-embedder.json` points at two content-addressed files: the ONNX model
 * (`card-embedder-<hash>.onnx`, ~6 MB) and the int8 embeddings of every
 * printing (`embeddings-<hash>.bin`, ~1 MB). Retraining or regenerating
 * replaces the pointer only.
 *
 * Every function resolves rather than throws: the embedder only speeds up the
 * search, and the order hash covers its absence.
 */
import { createEmbedder, decodeEmbeddings, getScanEmbedder, setScanEmbedder } from "./cardEmbed";
import type { ScanCandidate } from "./cardScanMatch";

const DB_NAME = "optcg-scan-embedder";
const STORE = "bundle";
const KEY = "current";

export type EmbedderPointer = {
  formatVersion: string;
  model: { file: string; hash: string; bytes: number };
  embeddings: { file: string; hash: string; bytes: number; count: number; dim: number };
};

type Stored = { pointer: EmbedderPointer; model: ArrayBuffer; embeddings: ArrayBuffer };

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function readStored(): Promise<Stored | null> {
  try {
    const db = await openDb();
    const stored = await new Promise<Stored | undefined>((resolve, reject) => {
      const req = db.transaction(STORE, "readonly").objectStore(STORE).get(KEY);
      req.onsuccess = () => resolve(req.result as Stored | undefined);
      req.onerror = () => reject(req.error);
    });
    db.close();
    return stored ?? null;
  } catch {
    return null;
  }
}

async function writeStored(value: Stored): Promise<void> {
  const db = await openDb();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE, "readwrite");
    tx.objectStore(STORE).put(value, KEY);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
  db.close();
}

/** Does the stored bundle already hold exactly what the pointer names? */
export function isCurrent(stored: Stored | null, pointer: EmbedderPointer): boolean {
  return (
    !!stored &&
    stored.pointer.model.file === pointer.model.file &&
    stored.pointer.embeddings.file === pointer.embeddings.file &&
    stored.model.byteLength === pointer.model.bytes &&
    stored.embeddings.byteLength === pointer.embeddings.bytes
  );
}

/**
 * Make sure the bundle the server points at is stored, downloading it if not.
 * Offline or unpublished: keeps whatever is already stored. True when a usable
 * bundle is stored afterwards.
 */
export async function ensureCardEmbedder(baseUrl: string): Promise<boolean> {
  const stored = await readStored();
  try {
    const res = await fetch(`${baseUrl}/card-embedder.json`, { cache: "no-cache" });
    if (!res.ok) return !!stored;
    const pointer = (await res.json()) as EmbedderPointer;
    if (isCurrent(stored, pointer)) return true;
    const [model, embeddings] = await Promise.all([
      fetch(`${baseUrl}/${pointer.model.file}`),
      fetch(`${baseUrl}/${pointer.embeddings.file}`),
    ]);
    if (!model.ok || !embeddings.ok) return !!stored;
    const next = { pointer, model: await model.arrayBuffer(), embeddings: await embeddings.arrayBuffer() };
    if (next.model.byteLength !== pointer.model.bytes || next.embeddings.byteLength !== pointer.embeddings.bytes) {
      return !!stored;
    }
    await writeStored(next);
    return true;
  } catch {
    return !!stored;
  }
}

/** Give each candidate its embedding, joined by descriptor label. Returns how many matched. */
export function attachEmbeddings(candidates: ScanCandidate[], embeddings: ArrayBuffer): number {
  const { byLabel } = decodeEmbeddings(embeddings);
  let n = 0;
  for (const c of candidates) {
    const row = byLabel.get(c.label);
    if (row) {
      c.embedding = row;
      n += 1;
    }
  }
  return n;
}

/**
 * Load the stored bundle: register the embedder and attach the embeddings to
 * `candidates`. False when there is none or it cannot run.
 */
export async function activateCardEmbedder(candidates: ScanCandidate[]): Promise<boolean> {
  const stored = await readStored();
  if (!stored) return false;
  try {
    if (attachEmbeddings(candidates, stored.embeddings) === 0) return false;
    setScanEmbedder(await createEmbedder(new Uint8Array(stored.model)));
    return true;
  } catch {
    for (const c of candidates) c.embedding = undefined;
    return false;
  }
}

/** Unregister and free the embedder (the WASM session is not garbage collected). */
export async function releaseCardEmbedder(): Promise<void> {
  const e = getScanEmbedder();
  setScanEmbedder(null);
  await e?.release();
}
