import { loadCardDetector } from "./cardDetectModel";

const DB_NAME = "optcg-scan-detector";
const STORE = "model";
const KEY = "current";

export type DetectorPointer = {
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

export function isCurrent(stored: Stored | null, pointer: DetectorPointer): boolean {
  return !!stored && stored.pointer.file === pointer.file && stored.data.byteLength === pointer.bytes;
}

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

export async function activateCardDetector(): Promise<boolean> {
  const stored = await readStored();
  if (!stored) return false;
  return loadCardDetector(new Uint8Array(stored.data));
}
