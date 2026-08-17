/** Tesseract pipeline for reading a card face.
 *
 * The engine is loaded on first use via dynamic import so the ~3 MB wasm core
 * and language data never touch the initial bundle.
 *
 * The read is deliberately unrestricted rather than whitelisted to the id
 * alphabet: the printed card name is the strongest signal for rejecting a
 * misread digit, so the name has to come back too.
 */

import type { Worker } from "tesseract.js";
import {
  findCardQuad,
  rectifyToCanvas,
  regionToBox,
  REGIONS,
  type Quad,
} from "./cardRectify";
import { extractCardIdTokens } from "./cardScan";
import { scanLog } from "./scanLog";

/** Long-edge size fed to Tesseract. Collector numbers are small on the card
 *  face, and the engine reads small glyphs far better when upscaled. */
const TARGET_LONG_EDGE = 1800;

export type ScanProgress = {
  /** Coarse stage, suitable for a status line. */
  stage: "loading-engine" | "recognizing";
  /** 0–1 when the engine reports it. */
  progress: number;
};

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
    // An empty type is unknown, not wrong — let the decoder be the judge.
    if (file.type && !file.type.startsWith("image/")) {
      return { ok: false, reason: "not-image" };
    }
    return { ok: true, blob: file };
  }

  const url = (dt.getData("text/uri-list") || dt.getData("text/plain") || "").trim();
  if (!/^https?:\/\//i.test(url)) return { ok: false, reason: "empty" };
  try {
    const res = await fetch(url, { mode: "cors" });
    if (!res.ok) return { ok: false, reason: "remote-blocked" };
    const blob = await res.blob();
    if (blob.type && !blob.type.startsWith("image/")) {
      return { ok: false, reason: "not-image" };
    }
    return { ok: true, blob };
  } catch {
    // Cross-origin images frequently refuse a CORS read.
    return { ok: false, reason: "remote-blocked" };
  }
}

/**
 * Upscale, desaturate, and stretch contrast.
 *
 * Convention-hall photos are dim and low-contrast; a linear stretch over the
 * observed range recovers separation between ink and card stock without the
 * information loss of hard binarisation.
 */
export function preprocess(source: ImageSource): HTMLCanvasElement {
  const sw = source.width;
  const sh = source.height;
  const scale = Math.max(1, TARGET_LONG_EDGE / Math.max(sw, sh));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(sw * scale);
  canvas.height = Math.round(sh * scale);
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) return canvas;
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(source, 0, 0, canvas.width, canvas.height);

  const image = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const px = image.data;
  let min = 255;
  let max = 0;
  // Pass one: luminance and its range.
  for (let i = 0; i < px.length; i += 4) {
    const lum = (px[i] * 0.299 + px[i + 1] * 0.587 + px[i + 2] * 0.114) | 0;
    px[i] = lum;
    if (lum < min) min = lum;
    if (lum > max) max = lum;
  }
  // Pass two: stretch to full range, guarding against a flat image.
  const span = Math.max(1, max - min);
  for (let i = 0; i < px.length; i += 4) {
    const v = ((px[i] - min) * 255) / span;
    const clamped = v < 0 ? 0 : v > 255 ? 255 : v;
    px[i] = clamped;
    px[i + 1] = clamped;
    px[i + 2] = clamped;
    px[i + 3] = 255;
  }
  ctx.putImageData(image, 0, 0);
  return canvas;
}

/** Width used for corner search — full phone photos are far larger than needed. */
const DETECT_WIDTH = 640;

/**
 * Longest edge we will process at.
 *
 * A modern phone camera produces ~12MP (4032×3024). Working at that size buys
 * no accuracy — the card still resolves comfortably at 2000px — but it costs
 * a ~48MB getImageData allocation and several seconds, and mobile Safari
 * discards tabs that allocate heavily.
 */
const MAX_WORK_EDGE = 2000;

/** Downscale an oversized capture; pass smaller images through untouched. */
export function clampToWorkingSize(source: ImageBitmap): ImageBitmap | HTMLCanvasElement {
  const longest = Math.max(source.width, source.height);
  if (longest <= MAX_WORK_EDGE) return source;
  const scale = MAX_WORK_EDGE / longest;
  const c = document.createElement("canvas");
  c.width = Math.round(source.width * scale);
  c.height = Math.round(source.height * scale);
  const x = c.getContext("2d", { willReadFrequently: true });
  if (!x) return source;
  x.imageSmoothingQuality = "high";
  x.drawImage(source, 0, 0, c.width, c.height);
  return c;
}

/**
 * Upscale applied to the read band before OCR.
 *
 * Tuned on real photos, not clean scans: a warped JPEG carries far less usable
 * detail than a flat render, and 2× — which is ample on a clean scan — loses
 * the collector number entirely once the image has been through a camera and
 * a perspective warp. 3× reads it reliably on both.
 */
const BAND_ZOOM = 3;

type ImageSource = ImageBitmap | HTMLCanvasElement;

function toCanvas(source: ImageSource): HTMLCanvasElement {
  const c = document.createElement("canvas");
  c.width = source.width;
  c.height = source.height;
  const x = c.getContext("2d", { willReadFrequently: true });
  x?.drawImage(source, 0, 0);
  return c;
}

/**
 * Flatten the card and return just the strip carrying name and number.
 *
 * Corner search runs on a downscaled copy — it only needs the card's outline,
 * and a full-resolution sweep of a phone photo would cost far more for the
 * same answer. The corners are then scaled back up so the warp samples the
 * original pixels.
 *
 * Returns null when no plausible card is found, leaving the caller to fall
 * back to whole-image OCR rather than act on a bad crop.
 */
export function rectifiedReadBand(source: ImageSource): HTMLCanvasElement | null {
  const full = toCanvas(source);
  const fctx = full.getContext("2d", { willReadFrequently: true });
  if (!fctx) return null;

  const scale = Math.min(1, DETECT_WIDTH / source.width);
  const dw = Math.max(1, Math.round(source.width * scale));
  const dh = Math.max(1, Math.round(source.height * scale));
  const small = document.createElement("canvas");
  small.width = dw;
  small.height = dh;
  const sctx = small.getContext("2d", { willReadFrequently: true });
  if (!sctx) return null;
  sctx.drawImage(source, 0, 0, dw, dh);

  const quadSmall = findCardQuad(sctx.getImageData(0, 0, dw, dh));
  if (!quadSmall) return null;
  const inv = 1 / scale;
  const quad = quadSmall.map((p) => ({ x: p.x * inv, y: p.y * inv })) as Quad;

  const rect = rectifyToCanvas(fctx.getImageData(0, 0, full.width, full.height), quad);
  if (!rect) return null;

  const b = regionToBox(REGIONS.readBand, rect.width, rect.height);
  const band = document.createElement("canvas");
  band.width = (b.x1 - b.x0) * BAND_ZOOM;
  band.height = (b.y1 - b.y0) * BAND_ZOOM;
  const bctx = band.getContext("2d");
  if (!bctx) return null;
  bctx.imageSmoothingQuality = "high";
  bctx.drawImage(rect, b.x0, b.y0, b.x1 - b.x0, b.y1 - b.y0, 0, 0, band.width, band.height);
  return band;
}

let workerPromise: Promise<Worker> | null = null;

/**
 * Get the shared Tesseract worker, creating it on first use.
 *
 * Kept module-level so the engine download is paid once per session rather
 * than per scan.
 */
export async function getScanWorker(onProgress?: (p: ScanProgress) => void): Promise<Worker> {
  if (!workerPromise) {
    workerPromise = (async () => {
      const { createWorker } = await import("tesseract.js");
      return createWorker("eng", 1, {
        logger: (m: { status?: string; progress?: number }) => {
          if (!onProgress) return;
          const progress = typeof m.progress === "number" ? m.progress : 0;
          onProgress({
            stage: m.status === "recognizing text" ? "recognizing" : "loading-engine",
            progress,
          });
        },
      });
    })().catch((err) => {
      // Let a later attempt retry rather than caching the failure forever.
      workerPromise = null;
      throw err;
    });
  }
  return workerPromise;
}

/** True once the engine is resident, so the UI can say whether a scan is instant. */
export function isScanEngineReady(): boolean {
  return workerPromise !== null;
}

/** Read all text off a prepared card image. */
export async function recognizeCardText(
  file: Blob,
  onProgress?: (p: ScanProgress) => void,
): Promise<string> {
  const worker = await getScanWorker(onProgress);
  const bitmap = await loadImage(file);
  try {
    // Preferred path: flatten the card and read only the name/number strip.
    // Faster than whole-card OCR and correct on angled photos where the
    // whole-card pass failed outright.
    // Cap resolution before any pixel work: a 12MP capture is pure cost.
    const source = clampToWorkingSize(bitmap);
    if (source !== bitmap) {
      scanLog("scan:downscale", `${bitmap.width}x${bitmap.height} -> ${source.width}x${source.height}`);
    }
    let band: HTMLCanvasElement | null = null;
    try {
      band = rectifiedReadBand(source);
      scanLog("scan:rectify", band ? "card found, reading strip" : "no card outline, full image");
    } catch (err) {
      scanLog("scan:rectify-error", err);
    }

    let text = "";
    if (band) {
      text = (await worker.recognize(band)).data.text ?? "";
      if (extractCardIdTokens(text).length) return text;
      // The strip yielded a name but no number. This is what an
      // already-cropped image does: the card fills the frame, corner detection
      // lands slightly inside it, and the read band slides up off the number.
      // Never let rectifying lose what the plain pass would have found.
      scanLog("scan:rectify-fallback", "no id in strip, retrying whole image");
    }
    const whole = (await worker.recognize(preprocess(source))).data.text ?? "";
    // Keep both: the strip is the better source for the printed name, the
    // whole image for the number, and the resolver cross-checks the two.
    return text ? `${text}\n${whole}` : whole;
  } finally {
    bitmap.close?.();
  }
}

/** Release the engine and its memory. */
export async function disposeScanWorker(): Promise<void> {
  if (!workerPromise) return;
  const pending = workerPromise;
  workerPromise = null;
  try {
    const worker = await pending;
    await worker.terminate();
  } catch {
    /* already gone */
  }
}
