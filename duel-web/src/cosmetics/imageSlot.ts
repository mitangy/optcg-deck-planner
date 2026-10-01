/**
 * Persistence for user-uploaded cosmetic images (playmat, card back).
 *
 * Pure logic only — no DOM access at import time — so it can be unit tested in
 * node. Browser-specific pieces (IndexedDB, canvas encode) are injected.
 */

/** Minimal async key/value store for Blobs. */
export type BlobBackend = {
  get(key: string): Promise<Blob | undefined>;
  put(key: string, blob: Blob): Promise<void>;
  delete(key: string): Promise<void>;
};

/** One rung of the re-encode ladder: tried in order until a save fits. */
export type EncodeStep = { maxWidth: number; quality: number };

export type ImageSlotOptions = {
  key: string;
  backend: BlobBackend;
  /** Crop / scale / re-encode the upload for one ladder step. */
  encode: (file: Blob, step: EncodeStep) => Promise<Blob>;
  /** Largest first; smaller steps are used when storage quota is tight. */
  ladder: readonly EncodeStep[];
  /** Blob → displayable URL (defaults to URL.createObjectURL). */
  toUrl?: (blob: Blob) => string;
  revokeUrl?: (url: string) => void;
  /** Called after a successful save (e.g. navigator.storage.persist()). */
  afterSave?: () => void;
};

export type ImageSlot = {
  /** Cached URL: undefined = not loaded yet, null = none stored. */
  current(): string | null | undefined;
  load(): Promise<string | null>;
  /** Encode and store an upload; resolves to the stored (re-encoded) image. */
  save(file: Blob): Promise<Blob>;
  /** Store an already-encoded image as-is (e.g. one downloaded from the account). */
  put(blob: Blob): Promise<void>;
  /** The stored image itself (null when none). */
  blob(): Promise<Blob | null>;
  clear(): Promise<void>;
  subscribe(listener: () => void): () => void;
};

export const QUOTA_MESSAGE =
  "Browser storage is full — free up site data or pick a smaller image.";

/** True for storage quota failures across browsers (Chrome, Firefox, Safari). */
export function isQuotaError(e: unknown): boolean {
  if (!e || typeof e !== "object") return false;
  const err = e as { name?: unknown; code?: unknown; message?: unknown };
  if (err.name === "QuotaExceededError" || err.name === "NS_ERROR_DOM_QUOTA_REACHED") {
    return true;
  }
  if (err.code === 22 || err.code === 1014) return true;
  return typeof err.message === "string" && /quota/i.test(err.message);
}

/** Center cover-crop rectangle of `aspect` (w/h) inside a srcW × srcH image. */
export function coverCropRect(
  srcW: number,
  srcH: number,
  aspect: number,
): { sx: number; sy: number; sw: number; sh: number } {
  let sw = srcW;
  let sh = srcH;
  if (srcW / srcH > aspect) sw = sh * aspect;
  else sh = sw / aspect;
  return { sx: (srcW - sw) / 2, sy: (srcH - sh) / 2, sw, sh };
}

/** Output size for a crop: never upscales, capped at maxWidth. */
export function outputSize(
  cropWidth: number,
  aspect: number,
  maxWidth: number,
): { width: number; height: number } {
  const width = Math.max(1, Math.min(maxWidth, Math.round(cropWidth)));
  return { width, height: Math.max(1, Math.round(width / aspect)) };
}

/**
 * Try the primary backend; if it is unusable (IndexedDB blocked, private mode),
 * fall through to the secondary. Quota errors are rethrown so the caller can
 * retry with a smaller encode instead of silently switching stores.
 */
export function fallbackBackend(primary: BlobBackend, secondary: BlobBackend): BlobBackend {
  let usePrimary = true;
  async function run<T>(fn: (b: BlobBackend) => Promise<T>): Promise<T> {
    if (usePrimary) {
      try {
        return await fn(primary);
      } catch (e) {
        if (isQuotaError(e)) throw e;
        usePrimary = false;
      }
    }
    return fn(secondary);
  }
  return {
    get: (k) => run((b) => b.get(k)),
    put: (k, blob) => run((b) => b.put(k, blob)),
    delete: (k) => run((b) => b.delete(k)),
  };
}

export async function blobToDataUrl(blob: Blob): Promise<string> {
  const bytes = new Uint8Array(await blob.arrayBuffer());
  let bin = "";
  const CHUNK = 0x8000;
  for (let i = 0; i < bytes.length; i += CHUNK) {
    bin += String.fromCharCode(...bytes.subarray(i, i + CHUNK));
  }
  return `data:${blob.type || "application/octet-stream"};base64,${btoa(bin)}`;
}

export function dataUrlToBlob(url: string): Blob | undefined {
  const m = /^data:([^;,]*);base64,(.*)$/.exec(url);
  if (!m) return undefined;
  const bin = atob(m[2]!);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return new Blob([bytes], { type: m[1] || "application/octet-stream" });
}

/**
 * localStorage backend (data URLs). Used only when IndexedDB is unavailable;
 * `maxChars` keeps one image from eating the ~5 MB origin budget.
 */
export function localStorageBackend(
  storage: Pick<Storage, "getItem" | "setItem" | "removeItem">,
  prefix: string,
  maxChars = 1_500_000,
): BlobBackend {
  return {
    async get(key) {
      const raw = storage.getItem(prefix + key);
      return raw ? dataUrlToBlob(raw) : undefined;
    },
    async put(key, blob) {
      const url = await blobToDataUrl(blob);
      if (url.length > maxChars) {
        throw new DOMException("Image too large for localStorage", "QuotaExceededError");
      }
      storage.setItem(prefix + key, url);
    },
    async delete(key) {
      storage.removeItem(prefix + key);
    },
  };
}

export function memoryBackend(): BlobBackend & { data: Map<string, Blob> } {
  const data = new Map<string, Blob>();
  return {
    data,
    async get(k) {
      return data.get(k);
    },
    async put(k, b) {
      data.set(k, b);
    },
    async delete(k) {
      data.delete(k);
    },
  };
}

export function createImageSlot(opts: ImageSlotOptions): ImageSlot {
  const toUrl = opts.toUrl ?? ((b: Blob) => URL.createObjectURL(b));
  const revoke = opts.revokeUrl ?? ((u: string) => URL.revokeObjectURL(u));
  const listeners = new Set<() => void>();
  let cached: string | null | undefined;
  let loading: Promise<string | null> | null = null;

  function emit(url: string | null) {
    if (cached) revoke(cached);
    cached = url;
    for (const l of listeners) l();
  }

  return {
    current: () => cached,
    load() {
      if (cached !== undefined) return Promise.resolve(cached);
      loading ??= opts.backend
        .get(opts.key)
        .then((blob) => (blob ? toUrl(blob) : null))
        .catch(() => null)
        .then((url) => {
          // A save/clear may have landed while we were reading.
          if (cached === undefined) cached = url;
          else if (url) revoke(url);
          loading = null;
          return cached;
        });
      return loading;
    },
    async save(file) {
      if (file.type && !file.type.startsWith("image/")) {
        throw new Error("Choose an image file.");
      }
      let lastQuota: unknown = null;
      for (const step of opts.ladder) {
        const blob = await opts.encode(file, step);
        try {
          await opts.backend.put(opts.key, blob);
        } catch (e) {
          if (isQuotaError(e)) {
            lastQuota = e;
            continue;
          }
          throw new Error("Could not save the image in this browser.");
        }
        emit(toUrl(blob));
        opts.afterSave?.();
        return blob;
      }
      if (lastQuota) throw new Error(QUOTA_MESSAGE);
      throw new Error("Could not save the image in this browser.");
    },
    async put(blob) {
      await opts.backend.put(opts.key, blob);
      emit(toUrl(blob));
    },
    async blob() {
      return (await opts.backend.get(opts.key).catch(() => undefined)) ?? null;
    },
    async clear() {
      try {
        await opts.backend.delete(opts.key);
      } finally {
        emit(null);
      }
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
}
