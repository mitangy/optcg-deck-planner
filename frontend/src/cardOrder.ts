/** Cheap ordering hint for the scan search.
 *
 * ORB verification costs ~1.2 ms per candidate, so scanning a 6,600-printing
 * catalog blind takes ~8 s. This orders candidates so the right one is
 * usually reached almost immediately — measured over 500 references, five of
 * six real photos matched at the *first* candidate and the sixth at the
 * 33rd.
 *
 * Ordering, never truncating. Every hash tried here is percentile-bound:
 * reliably in a top slice, never reliably in a fixed top-N. That makes a
 * shortlist unsafe (the answer falls off the end as the catalog grows) but
 * makes ordering ideal, because a bad ordering only costs time — the walk
 * still reaches every candidate, so correctness comes from the verifier
 * alone.
 *
 * Hashes the binary *edge map* rather than brightness: glare changes how
 * bright a region reads but does not move the printed ink, which is what
 * made this survive foil where luma-average hashes did not.
 */

/** Minimal shape both a Canvas ImageData and a decoded buffer satisfy. */
export type PixelSource = {
  width: number;
  height: number;
  data: Uint8ClampedArray | Uint8Array;
};

/** Cell grid. 16x22 ≈ the card's own 63:88 aspect, so cells are not stretched. */
const COLS = 16;
const ROWS = 22;

/** Working width for gradients — the downscale doubles as a denoising blur. */
const WORK_WIDTH = 200;

/** Top fraction of gradient magnitudes treated as edges: a percentile, not an
 *  absolute threshold, so it is invariant to overall contrast. */
const EDGE_PERCENTILE = 0.8;

/**
 * Vertical band excluded from every hash.
 *
 * Every TCGPlayer reference photo carries a "SAMPLE" watermark across the
 * middle and there is no unwatermarked source. Its hard white border is a
 * *strong* edge that exists only on the reference side, so including it
 * would compare a mark that no real card has.
 */
const EXCLUDED_ROWS: readonly [number, number] = [0.4, 0.62];

function rowIncluded(rowIndex: number, rows: number): boolean {
  const center = (rowIndex + 0.5) / rows;
  return center < EXCLUDED_ROWS[0] || center > EXCLUDED_ROWS[1];
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

/** Sobel gradient magnitude. Border pixels stay 0 (no neighbourhood). */
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

/** Hash of the card's edge structure, as a lowercase hex string. */
export function computeOrderHash(source: PixelSource): string {
  const grayImg = toGrayDownscaled(source, WORK_WIDTH);
  const { w, h } = grayImg;
  const mag = sobelMagnitude(grayImg);

  // Percentile over included rows only — the watermark's own edges would
  // otherwise inflate the threshold and suppress real card detail.
  const sample: number[] = [];
  for (let y = 1; y < h - 1; y += 1) {
    const frac = (y + 0.5) / h;
    if (frac >= EXCLUDED_ROWS[0] && frac <= EXCLUDED_ROWS[1]) continue;
    for (let x = 1; x < w - 1; x += 1) sample.push(mag[y * w + x]);
  }
  sample.sort((a, b) => a - b);
  const edgeThreshold = sample.length
    ? sample[Math.min(sample.length - 1, Math.floor(sample.length * EDGE_PERCENTILE))]
    : 0;

  const densities: number[] = [];
  for (let r = 0; r < ROWS; r += 1) {
    if (!rowIncluded(r, ROWS)) continue;
    const y0 = Math.floor((r * h) / ROWS);
    const y1 = Math.max(y0 + 1, Math.floor(((r + 1) * h) / ROWS));
    for (let c = 0; c < COLS; c += 1) {
      const x0 = Math.floor((c * w) / COLS);
      const x1 = Math.max(x0 + 1, Math.floor(((c + 1) * w) / COLS));
      let edges = 0;
      let total = 0;
      for (let y = y0; y < y1 && y < h; y += 1) {
        for (let x = x0; x < x1 && x < w; x += 1) {
          if (mag[y * w + x] > edgeThreshold) edges += 1;
          total += 1;
        }
      }
      densities.push(total ? edges / total : 0);
    }
  }

  const sorted = [...densities].sort((a, b) => a - b);
  const mid = sorted.length >> 1;
  const median = sorted.length
    ? sorted.length % 2
      ? sorted[mid]
      : (sorted[mid - 1] + sorted[mid]) / 2
    : 0;

  let bits = 0n;
  // Strictly greater, so an all-zero-density region yields 0s rather than
  // every bit flipping to 1 when the median itself is 0.
  for (const d of densities) bits = (bits << 1n) | (d > median ? 1n : 0n);
  return bits.toString(16).padStart(Math.ceil(densities.length / 4), "0");
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

/** Bits differing between two order hashes. Lower sorts first. */
export function orderDistance(a: string, b: string): number {
  return popcount(BigInt(`0x${a}`) ^ BigInt(`0x${b}`));
}
