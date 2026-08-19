/** Turning whatever the user gave us into pixels the matcher can use.
 *
 * Capture handling only — no matching logic. Kept separate because the
 * awkward parts here (HEIC, dragged web images, oversized captures) are
 * about browsers and input, not about card recognition.
 */

import { scanLog } from "./scanLog";

/**
 * Cap on the working long edge.
 *
 * A 12 MP phone capture costs ~48 MB per `getImageData` and buys nothing:
 * feature extraction sees the same structure at a fraction of the pixels.
 */
const MAX_WORK_EDGE = 2000;

/** Decode a file into something drawable, honouring EXIF orientation. */
export async function loadImage(file: Blob): Promise<ImageBitmap> {
  try {
    return await createImageBitmap(file, { imageOrientation: "from-image" });
  } catch {
    // HEIC is the common case here: it passes an `image/*` check but no
    // desktop browser can decode it, and the native error says nothing useful.
    const kind = file.type || "that format";
    throw new Error(
      `Couldn't read ${kind}. Try a JPEG or PNG — HEIC photos need converting first.`,
    );
  }
}

export type DropResult =
  | { ok: true; blob: Blob }
  | { ok: false; reason: "empty" | "not-image" | "remote-blocked" };

/**
 * Pull an image out of a drop, from a file or a dragged web image.
 *
 * Dragging a picture out of another browser tab carries no file at all — only
 * a URL — so files-only handling silently ignores one of the most natural
 * ways to use this. Some platforms also hand over files with an empty MIME
 * type, which a strict `image/` test would reject.
 */
export async function readDroppedImage(dt: DataTransfer): Promise<DropResult> {
  const file = dt.files?.[0];
  if (file) {
    if (file.type && !file.type.startsWith("image/")) return { ok: false, reason: "not-image" };
    return { ok: true, blob: file };
  }
  const uri = dt.getData("text/uri-list") || dt.getData("text/plain");
  if (!uri) return { ok: false, reason: "empty" };
  try {
    const res = await fetch(uri);
    if (!res.ok) return { ok: false, reason: "remote-blocked" };
    const blob = await res.blob();
    if (blob.type && !blob.type.startsWith("image/")) return { ok: false, reason: "not-image" };
    return { ok: true, blob };
  } catch {
    // Cross-origin reads are blocked far more often than not; say so rather
    // than reporting a generic failure.
    return { ok: false, reason: "remote-blocked" };
  }
}

/** Decode a capture and return pixels, downscaled if oversized. */
export async function loadImageForScan(file: Blob): Promise<ImageData> {
  const bitmap = await loadImage(file);
  try {
    const longest = Math.max(bitmap.width, bitmap.height);
    const scale = longest > MAX_WORK_EDGE ? MAX_WORK_EDGE / longest : 1;
    const width = Math.max(1, Math.round(bitmap.width * scale));
    const height = Math.max(1, Math.round(bitmap.height * scale));
    if (scale < 1) scanLog("scan:downscale", `${bitmap.width}x${bitmap.height} -> ${width}x${height}`);
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    if (!ctx) throw new Error("Couldn't prepare the image for scanning.");
    ctx.imageSmoothingQuality = "high";
    ctx.drawImage(bitmap, 0, 0, width, height);
    return ctx.getImageData(0, 0, width, height);
  } finally {
    bitmap.close?.();
  }
}
