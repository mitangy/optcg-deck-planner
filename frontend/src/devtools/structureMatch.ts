/** Two structural matching techniques, both aimed at the foil-glare failure
 * that every luma-statistics hash we tried could not rank correctly.
 *
 * 1. `computeEdgeHash` — hash the binary *edge map* rather than brightness.
 *    Different in kind from dHash: dHash still compares brightness averages,
 *    whereas an edge map encodes where the printed linework physically is.
 *    Glare changes how bright a region reads; it does not move the ink. The
 *    edge threshold is a percentile of gradient magnitude rather than an
 *    absolute value, so it is invariant to overall contrast.
 *
 * 2. `zncc` — zero-mean normalized cross-correlation over small grayscale
 *    thumbnails, skipping hashing entirely. ZNCC is invariant to affine
 *    brightness change (gain + offset) by construction, and unlike a hash it
 *    keeps the actual magnitudes instead of collapsing each cell to one bit
 *    — which is the other half of why the hashes had so little to work with.
 *
 * Both exclude the same fixed band as imageHash.ts: every TCGPlayer
 * reference photo carries a "SAMPLE" watermark, and its hard white border is
 * a *strong* edge that exists only on the reference side, so leaving it in
 * would be actively misleading here.
 */

import type { PixelSource } from "../imageHash";

const EXCLUDED_ROWS: readonly [number, number] = [0.4, 0.62];

/** Cell grid for the edge hash. 16x22 ≈ the card's own 63:88 aspect. */
const EDGE_COLS = 16;
const EDGE_ROWS = 22;

/** Working width for gradient work — the downscale doubles as a denoising blur. */
const WORK_WIDTH = 200;

/** Top fraction of gradient magnitudes treated as edges (percentile, not absolute). */
const EDGE_PERCENTILE = 0.8;

/** Thumbnail grid for ZNCC. Small enough to brute-force a whole catalog. */
const ZNCC_COLS = 24;
const ZNCC_ROWS = 32;

function rowIncluded(rowIndex: number, rows: number): boolean {
  const center = (rowIndex + 0.5) / rows;
  return center < EXCLUDED_ROWS[0] || center > EXCLUDED_ROWS[1];
}

function fractionIncluded(fracY: number): boolean {
  return fracY < EXCLUDED_ROWS[0] || fracY > EXCLUDED_ROWS[1];
}

type Gray = { gray: Float64Array; w: number; h: number };

/** Box-filter downsample to grayscale at a target width, preserving aspect. */
function toGrayDownscaled(source: PixelSource, targetWidth: number): Gray {
  const { width: sw, height: sh, data: px } = source;
  const w = Math.max(1, Math.min(targetWidth, sw));
  const h = Math.max(1, Math.round((w * sh) / sw));
  const gray = new Float64Array(w * h);
  for (let y = 0; y < h; y += 1) {
    const y0 = Math.floor((y * sh) / h);
    const y1 = Math.max(y0 + 1, Math.floor(((y + 1) * sh) / h));
    for (let x = 0; x < w; x += 1) {
      const x0 = Math.floor((x * sw) / w);
      const x1 = Math.max(x0 + 1, Math.floor(((x + 1) * sw) / w));
      let sum = 0;
      let count = 0;
      for (let sy = y0; sy < y1 && sy < sh; sy += 1) {
        for (let sx = x0; sx < x1 && sx < sw; sx += 1) {
          const i = (sy * sw + sx) * 4;
          sum += px[i] * 0.299 + px[i + 1] * 0.587 + px[i + 2] * 0.114;
          count += 1;
        }
      }
      gray[y * w + x] = count ? sum / count : 0;
    }
  }
  return { gray, w, h };
}

/** Sobel gradient magnitude. Border pixels stay 0 (no neighborhood). */
function sobelMagnitude({ gray, w, h }: Gray): Float64Array {
  const mag = new Float64Array(w * h);
  for (let y = 1; y < h - 1; y += 1) {
    for (let x = 1; x < w - 1; x += 1) {
      const tl = gray[(y - 1) * w + x - 1];
      const tc = gray[(y - 1) * w + x];
      const tr = gray[(y - 1) * w + x + 1];
      const ml = gray[y * w + x - 1];
      const mr = gray[y * w + x + 1];
      const bl = gray[(y + 1) * w + x - 1];
      const bc = gray[(y + 1) * w + x];
      const br = gray[(y + 1) * w + x + 1];
      const gx = tr + 2 * mr + br - (tl + 2 * ml + bl);
      const gy = bl + 2 * bc + br - (tl + 2 * tc + tr);
      mag[y * w + x] = Math.hypot(gx, gy);
    }
  }
  return mag;
}

class BitWriter {
  private bits = 0n;
  private count = 0;
  push(bit: boolean): void {
    this.bits = (this.bits << 1n) | (bit ? 1n : 0n);
    this.count += 1;
  }
  toHex(): string {
    return this.bits.toString(16).padStart(Math.ceil(this.count / 4), "0");
  }
}

/**
 * Hash of the card's edge structure.
 *
 * Sobel → percentile threshold to a binary edge map → per-cell edge density
 * → threshold each cell against the median density. The output is still one
 * bit per cell, but what those bits describe is structural (is there printed
 * detail here) rather than photometric (is this region bright).
 */
export function computeEdgeHash(source: PixelSource): string {
  const grayImg = toGrayDownscaled(source, WORK_WIDTH);
  const { w, h } = grayImg;
  const mag = sobelMagnitude(grayImg);

  // Percentile over included rows only — the watermark's own edges would
  // otherwise inflate the threshold and suppress real card detail.
  const sample: number[] = [];
  for (let y = 1; y < h - 1; y += 1) {
    if (!fractionIncluded((y + 0.5) / h)) continue;
    for (let x = 1; x < w - 1; x += 1) sample.push(mag[y * w + x]);
  }
  sample.sort((a, b) => a - b);
  const edgeThreshold = sample.length
    ? sample[Math.min(sample.length - 1, Math.floor(sample.length * EDGE_PERCENTILE))]
    : 0;

  // Per-cell edge density over the cell grid.
  const densities: number[] = [];
  const cellIndex: number[] = [];
  for (let r = 0; r < EDGE_ROWS; r += 1) {
    if (!rowIncluded(r, EDGE_ROWS)) continue;
    const y0 = Math.floor((r * h) / EDGE_ROWS);
    const y1 = Math.max(y0 + 1, Math.floor(((r + 1) * h) / EDGE_ROWS));
    for (let c = 0; c < EDGE_COLS; c += 1) {
      const x0 = Math.floor((c * w) / EDGE_COLS);
      const x1 = Math.max(x0 + 1, Math.floor(((c + 1) * w) / EDGE_COLS));
      let edges = 0;
      let total = 0;
      for (let y = y0; y < y1 && y < h; y += 1) {
        for (let x = x0; x < x1 && x < w; x += 1) {
          if (mag[y * w + x] > edgeThreshold) edges += 1;
          total += 1;
        }
      }
      densities.push(total ? edges / total : 0);
      cellIndex.push(r * EDGE_COLS + c);
    }
  }

  const sorted = [...densities].sort((a, b) => a - b);
  const mid = sorted.length >> 1;
  const median = sorted.length
    ? sorted.length % 2
      ? sorted[mid]
      : (sorted[mid - 1] + sorted[mid]) / 2
    : 0;

  const writer = new BitWriter();
  // Strictly greater, so an all-zero-density region yields 0s rather than
  // every bit flipping to 1 when the median itself is 0.
  for (const d of densities) writer.push(d > median);
  return writer.toHex();
}

function popcount(n: bigint): number {
  let count = 0;
  let x = n;
  while (x > 0n) {
    x &= x - 1n;
    count += 1;
  }
  return count;
}

export function edgeHashDistance(a: string, b: string): number {
  return popcount(BigInt(`0x${a}`) ^ BigInt(`0x${b}`));
}

/**
 * Grayscale thumbnail with the watermark band dropped, mean-centered and
 * scaled to unit norm — precomputed so ZNCC between two of them is just a
 * dot product.
 */
export function znccThumbnail(source: PixelSource): Float64Array {
  const { gray, w, h } = toGrayDownscaled(source, ZNCC_COLS);
  // toGrayDownscaled preserves aspect, so resample rows onto a fixed grid to
  // guarantee both sides have identical vector length regardless of input aspect.
  const values: number[] = [];
  for (let r = 0; r < ZNCC_ROWS; r += 1) {
    if (!rowIncluded(r, ZNCC_ROWS)) continue;
    const y = Math.min(h - 1, Math.floor(((r + 0.5) * h) / ZNCC_ROWS));
    for (let c = 0; c < ZNCC_COLS; c += 1) {
      const x = Math.min(w - 1, Math.floor(((c + 0.5) * w) / ZNCC_COLS));
      values.push(gray[y * w + x]);
    }
  }
  const vec = new Float64Array(values);
  let mean = 0;
  for (const v of vec) mean += v;
  mean /= vec.length || 1;
  let norm = 0;
  for (let i = 0; i < vec.length; i += 1) {
    vec[i] -= mean;
    norm += vec[i] * vec[i];
  }
  norm = Math.sqrt(norm);
  if (norm > 1e-9) {
    for (let i = 0; i < vec.length; i += 1) vec[i] /= norm;
  }
  return vec;
}

/** Correlation of two unit-norm mean-centered thumbnails: 1 = identical, 0 = unrelated. */
export function zncc(a: Float64Array, b: Float64Array): number {
  const n = Math.min(a.length, b.length);
  let dot = 0;
  for (let i = 0; i < n; i += 1) dot += a[i] * b[i];
  return dot;
}
