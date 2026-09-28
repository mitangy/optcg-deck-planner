/**
 * Custom playmat art. Uploaded images are cover-cropped to the official OPTCG
 * playmat ratio (24" × 14" → 12:7) and stored as a JPEG Blob in IndexedDB —
 * localStorage is too small for multi-megabyte art.
 */
import { useEffect, useState } from "react";

/** Official playmat aspect ratio (width / height). */
export const PLAYMAT_ASPECT = 12 / 7;
/** Stored width in px; 2400×1400 keeps printed-mat art crisp on 4K boards. */
const STORE_WIDTH = 2400;

const DB_NAME = "optcg-duel";
const STORE = "playmat";
const KEY = "mine";

const listeners = new Set<() => void>();
let cachedUrl: string | null | undefined;

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => {
      if (!req.result.objectStoreNames.contains(STORE)) {
        req.result.createObjectStore(STORE);
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function withStore<T>(
  mode: IDBTransactionMode,
  fn: (store: IDBObjectStore) => IDBRequest<T>,
): Promise<T> {
  const db = await openDb();
  try {
    return await new Promise<T>((resolve, reject) => {
      const tx = db.transaction(STORE, mode);
      const req = fn(tx.objectStore(STORE));
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  } finally {
    db.close();
  }
}

function emit(url: string | null) {
  if (cachedUrl) URL.revokeObjectURL(cachedUrl);
  cachedUrl = url;
  for (const l of listeners) l();
}

function loadImage(file: Blob): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve(img);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("That file could not be read as an image."));
    };
    img.src = url;
  });
}

/** Center cover-crop to 12:7 and re-encode as JPEG. */
async function cropToPlaymat(file: Blob): Promise<Blob> {
  const img = await loadImage(file);
  const srcAspect = img.naturalWidth / img.naturalHeight;
  let sw = img.naturalWidth;
  let sh = img.naturalHeight;
  if (srcAspect > PLAYMAT_ASPECT) sw = sh * PLAYMAT_ASPECT;
  else sh = sw / PLAYMAT_ASPECT;
  const sx = (img.naturalWidth - sw) / 2;
  const sy = (img.naturalHeight - sh) / 2;

  const width = Math.min(STORE_WIDTH, Math.round(sw));
  const height = Math.round(width / PLAYMAT_ASPECT);
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas is unavailable in this browser.");
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(img, sx, sy, sw, sh, 0, 0, width, height);
  return new Promise((resolve, reject) =>
    canvas.toBlob(
      (b) => (b ? resolve(b) : reject(new Error("Could not encode the playmat."))),
      "image/jpeg",
      0.88,
    ),
  );
}

export async function savePlaymat(file: File): Promise<void> {
  if (!file.type.startsWith("image/")) throw new Error("Choose an image file.");
  const blob = await cropToPlaymat(file);
  await withStore("readwrite", (s) => s.put(blob, KEY));
  emit(URL.createObjectURL(blob));
}

export async function clearPlaymat(): Promise<void> {
  await withStore("readwrite", (s) => s.delete(KEY));
  emit(null);
}

async function loadPlaymatUrl(): Promise<string | null> {
  if (cachedUrl !== undefined) return cachedUrl;
  try {
    const blob = await withStore<Blob | undefined>("readonly", (s) => s.get(KEY));
    cachedUrl = blob ? URL.createObjectURL(blob) : null;
  } catch {
    cachedUrl = null;
  }
  return cachedUrl;
}

/** Object URL of the uploaded playmat, or null when none is set. */
export function usePlaymatUrl(): string | null {
  const [url, setUrl] = useState<string | null>(cachedUrl ?? null);
  useEffect(() => {
    let alive = true;
    void loadPlaymatUrl().then((u) => {
      if (alive) setUrl(u);
    });
    const onChange = () => setUrl(cachedUrl ?? null);
    listeners.add(onChange);
    return () => {
      alive = false;
      listeners.delete(onChange);
    };
  }, []);
  return url;
}
