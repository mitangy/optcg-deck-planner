import { describe, expect, it, vi } from "vitest";
import {
  QUOTA_MESSAGE,
  blobToDataUrl,
  coverCropRect,
  createImageSlot,
  dataUrlToBlob,
  fallbackBackend,
  isQuotaError,
  localStorageBackend,
  memoryBackend,
  outputSize,
  type BlobBackend,
  type EncodeStep,
} from "./imageSlot";

function quotaError(): DOMException {
  return new DOMException("full", "QuotaExceededError");
}

function fakeStorage() {
  const data = new Map<string, string>();
  return {
    data,
    getItem: (k: string) => data.get(k) ?? null,
    setItem: (k: string, v: string) => void data.set(k, v),
    removeItem: (k: string) => void data.delete(k),
  };
}

function makeSlot(backend: BlobBackend, ladder: EncodeStep[] = [{ maxWidth: 100, quality: 1 }]) {
  let n = 0;
  const revoked: string[] = [];
  const encode = vi.fn(
    async (_file: Blob, step: EncodeStep) =>
      new Blob([new Uint8Array(step.maxWidth)], { type: "image/jpeg" }),
  );
  const slot = createImageSlot({
    key: "mine",
    backend,
    encode,
    ladder,
    toUrl: () => `blob:${++n}`,
    revokeUrl: (u) => revoked.push(u),
  });
  return { slot, encode, revoked };
}

const png = () => new Blob([new Uint8Array([1, 2, 3])], { type: "image/png" });

describe("isQuotaError", () => {
  it("detects quota errors across browsers", () => {
    expect(isQuotaError(quotaError())).toBe(true);
    expect(isQuotaError({ name: "NS_ERROR_DOM_QUOTA_REACHED" })).toBe(true);
    expect(isQuotaError({ code: 22 })).toBe(true);
    expect(isQuotaError(new Error("Quota exceeded for origin"))).toBe(true);
    expect(isQuotaError(new Error("nope"))).toBe(false);
    expect(isQuotaError(null)).toBe(false);
  });
});

describe("crop math", () => {
  it("cover-crops wide images to the target aspect", () => {
    const r = coverCropRect(2000, 700, 12 / 7);
    expect(r.sh).toBe(700);
    expect(r.sw).toBeCloseTo(1200);
    expect(r.sx).toBeCloseTo(400);
    expect(r.sy).toBe(0);
  });

  it("cover-crops tall images to a card ratio", () => {
    const r = coverCropRect(630, 1000, 63 / 88);
    expect(r.sw).toBe(630);
    expect(r.sh).toBeCloseTo(880);
    expect(r.sy).toBeCloseTo(60);
  });

  it("never upscales and caps at maxWidth", () => {
    expect(outputSize(300, 63 / 88, 630)).toEqual({ width: 300, height: 419 });
    expect(outputSize(5000, 12 / 7, 2400)).toEqual({ width: 2400, height: 1400 });
  });
});

describe("data URL round trip", () => {
  it("encodes and decodes blobs", async () => {
    const blob = new Blob([new Uint8Array([0, 255, 10, 20])], { type: "image/webp" });
    const url = await blobToDataUrl(blob);
    expect(url.startsWith("data:image/webp;base64,")).toBe(true);
    const back = dataUrlToBlob(url)!;
    expect(back.type).toBe("image/webp");
    expect([...new Uint8Array(await back.arrayBuffer())]).toEqual([0, 255, 10, 20]);
    expect(dataUrlToBlob("garbage")).toBeUndefined();
  });
});

describe("localStorageBackend", () => {
  it("persists blobs under a prefix and enforces a size cap", async () => {
    const storage = fakeStorage();
    const be = localStorageBackend(storage, "p:", 200);
    await be.put("mine", new Blob([new Uint8Array(10)], { type: "image/jpeg" }));
    expect(storage.data.has("p:mine")).toBe(true);
    expect((await be.get("mine"))?.size).toBe(10);
    await expect(be.put("big", new Blob([new Uint8Array(1000)]))).rejects.toSatisfy(isQuotaError);
    await be.delete("mine");
    expect(await be.get("mine")).toBeUndefined();
  });
});

describe("fallbackBackend", () => {
  it("switches to the secondary when the primary is unusable", async () => {
    const broken: BlobBackend = {
      get: () => Promise.reject(new Error("IndexedDB unavailable")),
      put: () => Promise.reject(new Error("IndexedDB unavailable")),
      delete: () => Promise.reject(new Error("IndexedDB unavailable")),
    };
    const mem = memoryBackend();
    const be = fallbackBackend(broken, mem);
    await be.put("k", png());
    expect(mem.data.has("k")).toBe(true);
    expect(await be.get("k")).toBeDefined();
  });

  it("rethrows quota errors instead of switching stores", async () => {
    const full: BlobBackend = { ...memoryBackend(), put: () => Promise.reject(quotaError()) };
    const mem = memoryBackend();
    const be = fallbackBackend(full, mem);
    await expect(be.put("k", png())).rejects.toSatisfy(isQuotaError);
    expect(mem.data.size).toBe(0);
  });
});

describe("createImageSlot", () => {
  it("saves, reloads in a new session, and clears", async () => {
    const backend = memoryBackend();
    const a = makeSlot(backend);
    expect(await a.slot.load()).toBeNull();

    const listener = vi.fn();
    a.slot.subscribe(listener);
    await a.slot.save(png());
    expect(listener).toHaveBeenCalledTimes(1);
    expect(a.slot.current()).toBe("blob:1");
    expect(backend.data.has("mine")).toBe(true);

    // A fresh slot over the same backend (page reload) sees the saved image.
    const b = makeSlot(backend);
    expect(await b.slot.load()).toBe("blob:1");

    await a.slot.clear();
    expect(a.slot.current()).toBeNull();
    expect(a.revoked).toContain("blob:1");
    expect(backend.data.has("mine")).toBe(false);
  });

  it("rejects non-image files", async () => {
    const { slot } = makeSlot(memoryBackend());
    await expect(slot.save(new Blob(["x"], { type: "text/plain" }))).rejects.toThrow(
      "Choose an image file.",
    );
  });

  it("steps down the encode ladder on quota errors", async () => {
    const mem = memoryBackend();
    const backend: BlobBackend = {
      ...mem,
      put: async (k, b) => {
        if (b.size > 50) throw quotaError();
        await mem.put(k, b);
      },
    };
    const { slot, encode } = makeSlot(backend, [
      { maxWidth: 200, quality: 0.9 },
      { maxWidth: 100, quality: 0.8 },
      { maxWidth: 40, quality: 0.7 },
    ]);
    await slot.save(png());
    expect(encode).toHaveBeenCalledTimes(3);
    expect(mem.data.get("mine")?.size).toBe(40);
  });

  it("reports a friendly message when nothing fits", async () => {
    const backend: BlobBackend = { ...memoryBackend(), put: () => Promise.reject(quotaError()) };
    const { slot } = makeSlot(backend, [{ maxWidth: 10, quality: 1 }]);
    await expect(slot.save(png())).rejects.toThrow(QUOTA_MESSAGE);
    expect(slot.current()).toBeUndefined();
  });

  it("treats a failing read as no stored image", async () => {
    const backend: BlobBackend = { ...memoryBackend(), get: () => Promise.reject(new Error("x")) };
    const { slot } = makeSlot(backend);
    expect(await slot.load()).toBeNull();
  });
});
