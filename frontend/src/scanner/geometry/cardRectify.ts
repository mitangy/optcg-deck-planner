
export type Pt = { x: number; y: number };
export type Quad = [Pt, Pt, Pt, Pt];

export const CARD_ASPECT = 63 / 88;

export const RECTIFIED_HEIGHT = 1120;
export const RECTIFIED_WIDTH = Math.round(RECTIFIED_HEIGHT * CARD_ASPECT);

export function computeHomography(from: Quad, to: Quad): number[] | null {
  const a: number[][] = [];
  const b: number[] = [];
  for (let i = 0; i < 4; i += 1) {
    const { x, y } = from[i];
    const { x: u, y: v } = to[i];
    a.push([x, y, 1, 0, 0, 0, -u * x, -u * y]);
    b.push(u);
    a.push([0, 0, 0, x, y, 1, -v * x, -v * y]);
    b.push(v);
  }
  const n = 8;
  for (let col = 0; col < n; col += 1) {
    let pivot = col;
    for (let r = col + 1; r < n; r += 1) {
      if (Math.abs(a[r][col]) > Math.abs(a[pivot][col])) pivot = r;
    }
    if (Math.abs(a[pivot][col]) < 1e-9) return null;
    [a[col], a[pivot]] = [a[pivot], a[col]];
    [b[col], b[pivot]] = [b[pivot], b[col]];
    const d = a[col][col];
    for (let c = col; c < n; c += 1) a[col][c] /= d;
    b[col] /= d;
    for (let r = 0; r < n; r += 1) {
      if (r === col) continue;
      const f = a[r][col];
      if (!f) continue;
      for (let c = col; c < n; c += 1) a[r][c] -= f * a[col][c];
      b[r] -= f * b[col];
    }
  }
  return [b[0], b[1], b[2], b[3], b[4], b[5], b[6], b[7], 1];
}

export function applyHomography(h: number[], p: Pt): Pt {
  const d = h[6] * p.x + h[7] * p.y + h[8];
  if (!d) return { x: 0, y: 0 };
  return {
    x: (h[0] * p.x + h[1] * p.y + h[2]) / d,
    y: (h[3] * p.x + h[4] * p.y + h[5]) / d,
  };
}

export function orderCorners(points: Pt[]): Quad | null {
  if (points.length !== 4) return null;
  const bySum = [...points].sort((p, q) => p.x + p.y - (q.x + q.y));
  const byDiff = [...points].sort((p, q) => p.x - p.y - (q.x - q.y));
  const tl = bySum[0];
  const br = bySum[3];
  const bl = byDiff[0];
  const tr = byDiff[3];
  const unique = new Set([tl, tr, br, bl]);
  if (unique.size !== 4) return null;
  return [tl, tr, br, bl];
}

export function quadArea(q: Quad): number {
  let sum = 0;
  for (let i = 0; i < 4; i += 1) {
    const p = q[i];
    const n = q[(i + 1) % 4];
    sum += p.x * n.y - n.x * p.y;
  }
  return Math.abs(sum) / 2;
}

export function findCardQuad(data: ImageData, minAreaFraction = 0.12): Quad | null {
  const { width: w, height: h } = data;
  const px = data.data;
  const at = (x: number, y: number) => (y * w + x) * 4;

  const samples: number[][] = [];
  const step = Math.max(1, Math.floor(Math.min(w, h) / 40));
  for (let x = 0; x < w; x += step) {
    for (const y of [0, h - 1]) {
      const i = at(x, y);
      samples.push([px[i], px[i + 1], px[i + 2]]);
    }
  }
  for (let y = 0; y < h; y += step) {
    for (const x of [0, w - 1]) {
      const i = at(x, y);
      samples.push([px[i], px[i + 1], px[i + 2]]);
    }
  }
  if (!samples.length) return null;
  const med = (k: number) => {
    const v = samples.map((s) => s[k]).sort((p, q) => p - q);
    return v[Math.floor(v.length / 2)];
  };
  const bg = [med(0), med(1), med(2)];

  let spread = 0;
  for (const s of samples) {
    spread += Math.abs(s[0] - bg[0]) + Math.abs(s[1] - bg[1]) + Math.abs(s[2] - bg[2]);
  }
  spread /= samples.length;
  const threshold = Math.max(60, spread * 2.5);

  let tl: Pt | null = null;
  let tr: Pt | null = null;
  let br: Pt | null = null;
  let bl: Pt | null = null;
  let minSum = Infinity;
  let maxSum = -Infinity;
  let minDiff = Infinity;
  let maxDiff = -Infinity;
  let count = 0;

  for (let y = 0; y < h; y += 1) {
    for (let x = 0; x < w; x += 1) {
      const i = at(x, y);
      const d =
        Math.abs(px[i] - bg[0]) + Math.abs(px[i + 1] - bg[1]) + Math.abs(px[i + 2] - bg[2]);
      if (d < threshold) continue;
      count += 1;
      const sum = x + y;
      const diff = x - y;
      if (sum < minSum) {
        minSum = sum;
        tl = { x, y };
      }
      if (sum > maxSum) {
        maxSum = sum;
        br = { x, y };
      }
      if (diff < minDiff) {
        minDiff = diff;
        bl = { x, y };
      }
      if (diff > maxDiff) {
        maxDiff = diff;
        tr = { x, y };
      }
    }
  }
  if (!tl || !tr || !br || !bl) return null;
  if (count < w * h * minAreaFraction) return null;

  const quad: Quad = [tl, tr, br, bl];
  const area = quadArea(quad);
  if (area < w * h * minAreaFraction) return null;

  // No shape check beyond this: without a capture guide, a handheld photo's
  // projected card can legitimately take almost any aspect under perspective,
  // so a card-proportion test has no reliable signal to key off — it rejected
  // a genuinely correct detection (0.743 on a real flat-lay) while a wrong one
  // (a monitor bezel, 0.900) sat closer to a card's own 0.716. And a bad quad
  // here does not cost correctness anyway: the caller retries whole-image OCR
  // whenever the rectified read finds no card id, so the only price of
  // accepting a wrong quad is one extra OCR pass, not a wrong answer. Once a
  // capture guide constrains the crop, this whole function stops being asked
  // to guess and the question disappears.
  const width = Math.hypot(tr.x - tl.x, tr.y - tl.y);
  const height = Math.hypot(bl.x - tl.x, bl.y - tl.y);
  if (!width || !height) return null;
  return quad;
}

/**
 * Warp the quad onto a canonical upright card.
 *
 * Canvas only does affine transforms, so the perspective map is applied by
 * inverse sampling: for each output pixel, find where it came from in the
 * source. Bilinear sampling keeps small print legible.
 */
export function rectifyToCanvas(
  source: ImageData,
  quad: Quad,
  outWidth = RECTIFIED_WIDTH,
  outHeight = RECTIFIED_HEIGHT,
): HTMLCanvasElement | null {
  const target = rectifyToImageData(source, quad, outWidth, outHeight);
  if (!target) return null;
  const out = document.createElement("canvas");
  out.width = outWidth;
  out.height = outHeight;
  const ctx = out.getContext("2d");
  if (!ctx) return null;
  ctx.putImageData(new ImageData(target.data, outWidth, outHeight), 0, 0);
  return out;
}

export function rectifyToImageData(
  source: ImageData,
  quad: Quad,
  outWidth = RECTIFIED_WIDTH,
  outHeight = RECTIFIED_HEIGHT,
): ImageData | null {
  const dst: Quad = [
    { x: 0, y: 0 },
    { x: outWidth, y: 0 },
    { x: outWidth, y: outHeight },
    { x: 0, y: outHeight },
  ];
  const h = computeHomography(dst, quad);
  if (!h) return null;

  const tp = new Uint8ClampedArray(outWidth * outHeight * 4);
  const sw = source.width;
  const sh = source.height;
  const sp = source.data;

  for (let y = 0; y < outHeight; y += 1) {
    for (let x = 0; x < outWidth; x += 1) {
      const s = applyHomography(h, { x: x + 0.5, y: y + 0.5 });
      const o = (y * outWidth + x) * 4;
      if (s.x < 0 || s.y < 0 || s.x >= sw - 1 || s.y >= sh - 1) {
        tp[o + 3] = 255;
        continue;
      }
      const x0 = Math.floor(s.x);
      const y0 = Math.floor(s.y);
      const fx = s.x - x0;
      const fy = s.y - y0;
      const i00 = (y0 * sw + x0) * 4;
      const i10 = i00 + 4;
      const i01 = i00 + sw * 4;
      const i11 = i01 + 4;
      for (let c = 0; c < 3; c += 1) {
        const top = sp[i00 + c] * (1 - fx) + sp[i10 + c] * fx;
        const bot = sp[i01 + c] * (1 - fx) + sp[i11 + c] * fx;
        tp[o + c] = top * (1 - fy) + bot * fy;
      }
      tp[o + 3] = 255;
    }
  }
  return { data: tp, width: outWidth, height: outHeight, colorSpace: "srgb" } as ImageData;
}

export const REGIONS = {
  idStrip: { x: 0.45, y: 0.93, w: 0.55, h: 0.055 },
  star: { x: 0.871, y: 0.9265, w: 0.032, h: 0.023 },
  badge: { x: 0.869, y: 0.9455, w: 0.036, h: 0.022 },
  art: { x: 0.06, y: 0.1, w: 0.88, h: 0.45 },
  readBand: { x: 0.03, y: 0.855, w: 0.94, h: 0.135 },
} as const;

export function regionToBox(
  region: { x: number; y: number; w: number; h: number },
  width = RECTIFIED_WIDTH,
  height = RECTIFIED_HEIGHT,
) {
  return {
    x0: Math.round(region.x * width),
    y0: Math.round(region.y * height),
    x1: Math.round((region.x + region.w) * width),
    y1: Math.round((region.y + region.h) * height),
  };
}
