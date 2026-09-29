/**
 * Browser plumbing for cosmetic image slots: IndexedDB (with a localStorage
 * fallback), canvas cover-crop encode, and a React hook for the current URL.
 */
import { useEffect, useState } from "react";
import {
  coverCropRect,
  fallbackBackend,
  localStorageBackend,
  memoryBackend,
  outputSize,
  type BlobBackend,
  type EncodeStep,
  type ImageSlot,
} from "./imageSlot";

const DB_NAME = "optcg-duel";
/** v1 had only "playmat"; v2 adds "cardBack". Existing playmats are kept. */
const DB_VERSION = 2;
export const IDB_STORES = ["playmat", "cardBack"] as const;
export type IdbStore = (typeof IDB_STORES)[number];

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === "undefined") {
      reject(new Error("IndexedDB unavailable"));
      return;
    }
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      for (const name of IDB_STORES) {
        if (!req.result.objectStoreNames.contains(name)) req.result.createObjectStore(name);
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
    req.onblocked = () => reject(new Error("IndexedDB upgrade blocked by another tab"));
  });
}

function idbBackend(store: IdbStore): BlobBackend {
  async function withStore<T>(
    mode: IDBTransactionMode,
    fn: (s: IDBObjectStore) => IDBRequest,
  ): Promise<T> {
    const db = await openDb();
    try {
      return await new Promise<T>((resolve, reject) => {
        const tx = db.transaction(store, mode);
        const req = fn(tx.objectStore(store));
        let result: T;
        req.onsuccess = () => {
          result = req.result as T;
        };
        // Resolve on commit so quota failures (raised at commit) surface.
        tx.oncomplete = () => resolve(result);
        tx.onabort = () => reject(tx.error ?? req.error);
        tx.onerror = () => reject(tx.error ?? req.error);
      });
    } finally {
      db.close();
    }
  }
  return {
    get: (k) => withStore<Blob | undefined>("readonly", (s) => s.get(k)),
    put: (k, b) => withStore<void>("readwrite", (s) => s.put(b, k)),
    delete: (k) => withStore<void>("readwrite", (s) => s.delete(k)),
  };
}

function safeLocalStorage(): Storage | null {
  try {
    return typeof localStorage === "undefined" ? null : localStorage;
  } catch {
    return null;
  }
}

/** IndexedDB, falling back to localStorage (small images) or memory. */
export function cosmeticBackend(store: IdbStore): BlobBackend {
  const ls = safeLocalStorage();
  const secondary = ls ? localStorageBackend(ls, `optcg-duel:${store}:`) : memoryBackend();
  return fallbackBackend(idbBackend(store), secondary);
}

/** Ask the browser not to evict our stored art under storage pressure. */
export function requestPersistentStorage(): void {
  try {
    void navigator.storage?.persist?.().catch(() => undefined);
  } catch {
    // Unsupported — best effort only.
  }
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

/** Encoder that center cover-crops to `aspect` and re-encodes as `mime`. */
export function coverCropEncoder(aspect: number, mime: string) {
  return async (file: Blob, step: EncodeStep): Promise<Blob> => {
    const img = await loadImage(file);
    const { sx, sy, sw, sh } = coverCropRect(img.naturalWidth, img.naturalHeight, aspect);
    const { width, height } = outputSize(sw, aspect, step.maxWidth);
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("Canvas is unavailable in this browser.");
    ctx.imageSmoothingQuality = "high";
    ctx.drawImage(img, sx, sy, sw, sh, 0, 0, width, height);
    return new Promise((resolve, reject) =>
      canvas.toBlob(
        (b) => (b ? resolve(b) : reject(new Error("Could not encode the image."))),
        mime,
        step.quality,
      ),
    );
  };
}

/** Current URL for a slot (null when none), kept in sync across the app. */
export function useSlotUrl(slot: ImageSlot): string | null {
  const [url, setUrl] = useState<string | null>(slot.current() ?? null);
  useEffect(() => {
    let alive = true;
    const unsubscribe = slot.subscribe(() => setUrl(slot.current() ?? null));
    void slot.load().then((u) => {
      if (alive) setUrl(u);
    });
    return () => {
      alive = false;
      unsubscribe();
    };
  }, [slot]);
  return url;
}
