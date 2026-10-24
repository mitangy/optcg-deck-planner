/** Offline store for the learned card detector's ONNX model (#701).
 *
 * The model (~5 MB) is a build artifact like the descriptors: not committed,
 * served from the same `scan-data/` store, and kept in IndexedDB so scanning
 * works offline after the one-time download. It has its own tiny database so
 * it cannot disturb the descriptor cache's versioning.
 *
 * A pointer file, `card-detector.json`, names the current model by content
 * hash (`card-detector-<hash>.onnx`, immutable), so a retrained model is
 * picked up without touching the descriptor manifest.
 *
 * Every function resolves rather than throws: the detector is an upgrade, and
 * the OpenCV detector covers its absence.
 */
import { loadCardDetector } from "./cardDetectModel";

const DB_NAME = "optcg-scan-detector";
const STORE = "model";
const KEY = "current";

export type DetectorPointer = {
  /** Content-addressed file name, relative to the scan-data base. */
  file: string;
  hash: string;
  bytes: number;
};

type Stored = { pointer: DetectorPointer; data: ArrayBuffer };

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

/** Does the stored model already match what the pointer names? */
export function isCurrent(stored: Stored | null, pointer: DetectorPointer): boolean {
  return !!stored && stored.pointer.file === pointer.file && stored.data.byteLength === pointer.bytes;
}

/**
 * Make sure the model the server points at is stored, downloading it if not.
 * Offline or unpublished: keeps whatever is already stored. True when a usable
 * model is stored afterwards.
 */
export async function ensureCardDetector(baseUrl: string): Promise<boolean> {
  const stored = await readStored();
  try {
    const res = await fetch(`${baseUrl}/card-detector.json`, { cache: "no-cache" });
    if (!res.ok) return !!stored;
    const pointer = (await res.json()) as DetectorPointer;
    if (isCurrent(stored, pointer)) return true;
    const model = await fetch(`${baseUrl}/${pointer.file}`);
    if (!model.ok) return !!stored;
    const data = await model.arrayBuffer();
    if (data.byteLength !== pointer.bytes) return !!stored;
    await writeStored({ pointer, data });
    return true;
  } catch {
    return !!stored;
  }
}

/** Load the stored model into the detector registry. False when there is none. */
export async function activateCardDetector(): Promise<boolean> {
  const stored = await readStored();
  if (!stored) return false;
  return loadCardDetector(new Uint8Array(stored.data));
}
