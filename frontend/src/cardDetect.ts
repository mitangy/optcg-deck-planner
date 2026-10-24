/** Find every card in a photo.
 *
 * Several binary maps (Canny edges, adaptive threshold, Otsu both ways) are
 * contoured with OpenCV; each contour that fits a card-shaped quad becomes a
 * candidate. Pure-JS helpers below turn the candidates into the final list:
 * drop duplicates and a card's inner art box, drop a whole binder page that
 * merely contains the cards, fill pockets the contours missed, and sort into
 * reading order. Those helpers need no OpenCV, so they are unit-testable.
 */
import { CARD_ASPECT, findCardQuad, orderCorners, quadArea, type Pt, type Quad } from "./cardRectify";
import type { Cv } from "./cardMatch";

export type DetectOptions = {
  /** Long side of the working image. */
  workEdge?: number;
  /** Smallest card, as a fraction of the frame. */
  minAreaFraction?: number;
  /** Largest card, as a fraction of the frame. */
  maxAreaFraction?: number;
  /** Allowed relative deviation of the short/long side ratio from a card's. */
  aspectTolerance?: number;
  /** Infer binder pockets the contours missed. */
  fillGrid?: boolean;
  /** When nothing is found, try `findCardQuad` and then the whole frame. */
  fallback?: boolean;
  /** Diagnostics: candidates found by each binary map, before suppression. */
  onCandidates?: (map: string, quads: Quad[]) => void;
};

const DEFAULTS = {
  workEdge: 1000,
  minAreaFraction: 0.01,
  maxAreaFraction: 0.9,
  aspectTolerance: 0.22,
  fillGrid: true,
  fallback: true,
};

// ---------------------------------------------------------------- geometry

const dist = (a: Pt, b: Pt) => Math.hypot(a.x - b.x, a.y - b.y);

export function centroid(q: Quad): Pt {
  return { x: (q[0].x + q[1].x + q[2].x + q[3].x) / 4, y: (q[0].y + q[1].y + q[2].y + q[3].y) / 4 };
}

/** Mean lengths of the two side pairs: [across (TL-TR, BL-BR), down (TL-BL, TR-BR)]. */
export function quadSides(q: Quad): [number, number] {
  return [(dist(q[0], q[1]) + dist(q[3], q[2])) / 2, (dist(q[0], q[3]) + dist(q[1], q[2])) / 2];
}

/**
 * Is this quad card-shaped, in either orientation? Perspective squeezes the
 * ratio a little, so the band is generous; opposite sides must also agree.
 */
export function isCardShaped(q: Quad, tolerance = DEFAULTS.aspectTolerance): boolean {
  const [across, down] = quadSides(q);
  if (!across || !down) return false;
  const ratio = Math.min(across, down) / Math.max(across, down);
  if (Math.abs(ratio - CARD_ASPECT) > CARD_ASPECT * tolerance) return false;
  const pairRatio = (a: number, b: number) => Math.min(a, b) / Math.max(a, b || 1);
  return (
    pairRatio(dist(q[0], q[1]), dist(q[3], q[2])) > 0.6 && pairRatio(dist(q[0], q[3]), dist(q[1], q[2])) > 0.6
  );
}

/** Largest cards per side that a touching block is tried against. */
const MAX_BLOCK = 4;
const SEAM_SAMPLES = 60;
/** Pixels either side of the line that still count as on it. */
const SEAM_REACH = 1;
/** Share of samples along a seam that must sit on an edge pixel. */
const SEAM_HIT = 0.95;
/** Lines beside a seam must fall short of this, or the art is just busy. */
const SEAM_CONTROL_MAX = 0.9;

/** A binary edge map (255 = edge), as the detector's Canny output. */
export type EdgeMap = { data: ArrayLike<number>; width: number; height: number };

const lerpQuad = (q: Quad, u: number, v: number): Pt => ({
  x: (1 - v) * ((1 - u) * q[0].x + u * q[1].x) + v * ((1 - u) * q[3].x + u * q[2].x),
  y: (1 - v) * ((1 - u) * q[0].y + u * q[1].y) + v * ((1 - u) * q[3].y + u * q[2].y),
});

/** Share of points along a segment (inner 80%) with an edge pixel within one pixel. */
export function seamStrength(edges: EdgeMap, a: Pt, b: Pt): number {
  let hits = 0;
  for (let i = 0; i < SEAM_SAMPLES; i += 1) {
    const t = 0.1 + (0.8 * (i + 0.5)) / SEAM_SAMPLES;
    const x = Math.round(a.x + (b.x - a.x) * t);
    const y = Math.round(a.y + (b.y - a.y) * t);
    let hit = false;
    for (let dy = -SEAM_REACH; dy <= SEAM_REACH && !hit; dy += 1) {
      for (let dx = -SEAM_REACH; dx <= SEAM_REACH; dx += 1) {
        const xx = x + dx;
        const yy = y + dy;
        if (xx >= 0 && yy >= 0 && xx < edges.width && yy < edges.height && edges.data[yy * edges.width + xx]) {
          hit = true;
          break;
        }
      }
    }
    if (hit) hits += 1;
  }
  return hits / SEAM_SAMPLES;
}

/** Grids (n across, m down) whose cells would each be card-shaped, most cells first. */
function blockFits(across: number, down: number, tolerance: number): { n: number; m: number }[] {
  const fits: { n: number; m: number }[] = [];
  for (let n = 1; n <= MAX_BLOCK; n += 1) {
    for (let m = 1; m <= MAX_BLOCK; m += 1) {
      if (n * m === 1) continue;
      const cell = across / n / (down / m);
      const dev = Math.min(Math.abs(cell - CARD_ASPECT) / CARD_ASPECT, Math.abs(1 / cell - CARD_ASPECT) / CARD_ASPECT);
      if (dev <= tolerance) fits.push({ n, m });
    }
  }
  return fits.sort((a, b) => b.n * b.m - a.n * a.m);
}

/** Could this quad be a block of touching cards? */
export function isBlockShaped(q: Quad, tolerance = 0.15): boolean {
  const [across, down] = quadSides(q);
  return across > 0 && down > 0 && blockFits(across, down, tolerance).length > 0;
}

/**
 * Cells of a block of touching cards (a pair side by side, a row, 2x2...).
 *
 * Touching cards form one outline that can itself pass for a card (two
 * portrait cards side by side are as wide as one sideways card is). The block
 * is only split where every interior line is a straight run of edge pixels
 * and its two neighbours at a quarter-cell offset are not; a single card
 * therefore stays whole. Returns null when the quad is not such a block.
 */
export function splitBlock(edges: EdgeMap, q: Quad, tolerance = 0.15): Quad[] | null {
  const [across, down] = quadSides(q);
  if (!across || !down) return null;
  // Try the most cells first, then fewer, until every interior line is a seam.
  const fits = blockFits(across, down, tolerance);
  for (const { n, m } of fits) {
    let ok = true;
    for (let i = 1; i < n && ok; i += 1) ok = isSeam(edges, q, "across", i, n);
    for (let j = 1; j < m && ok; j += 1) ok = isSeam(edges, q, "down", j, m);
    if (!ok) continue;
    const cells: Quad[] = [];
    for (let j = 0; j < m; j += 1) {
      for (let i = 0; i < n; i += 1) {
        cells.push([
          lerpQuad(q, i / n, j / m),
          lerpQuad(q, (i + 1) / n, j / m),
          lerpQuad(q, (i + 1) / n, (j + 1) / m),
          lerpQuad(q, i / n, (j + 1) / m),
        ]);
      }
    }
    return cells;
  }
  return null;
}

function isSeam(
  edges: EdgeMap,
  q: Quad,
  axis: "across" | "down",
  index: number,
  cells: number,
): boolean {
  const at = index / cells;
  const control = 0.25 / cells;
  const line = (f: number): [Pt, Pt] =>
    axis === "across" ? [lerpQuad(q, f, 0), lerpQuad(q, f, 1)] : [lerpQuad(q, 0, f), lerpQuad(q, 1, f)];
  const on = seamStrength(edges, ...line(at));
  if (on < SEAM_HIT) return false;
  // Lines either side must be clearly weaker, or this is just busy artwork.
  return (
    seamStrength(edges, ...line(at - control)) <= SEAM_CONTROL_MAX &&
    seamStrength(edges, ...line(at + control)) <= SEAM_CONTROL_MAX
  );
}

/** Rotate the corner order so the long side runs top-to-bottom (cards are portrait). */
export function uprightQuad(q: Quad): Quad {
  const [across, down] = quadSides(q);
  return across > down ? [q[3], q[0], q[1], q[2]] : q;
}

/** Sutherland-Hodgman clip of one convex polygon by another. */
function clip(subject: Pt[], clipper: Pt[]): Pt[] {
  let out = subject;
  // Orientation of the clipper decides which side is "inside".
  const sign = polygonArea(clipper) >= 0 ? 1 : -1;
  for (let i = 0; i < clipper.length && out.length; i += 1) {
    const a = clipper[i];
    const b = clipper[(i + 1) % clipper.length];
    const side = (p: Pt) => sign * ((b.x - a.x) * (p.y - a.y) - (b.y - a.y) * (p.x - a.x));
    const input = out;
    out = [];
    for (let j = 0; j < input.length; j += 1) {
      const p = input[j];
      const n = input[(j + 1) % input.length];
      const sp = side(p);
      const sn = side(n);
      if (sp >= 0) out.push(p);
      if (sp >= 0 !== sn >= 0) {
        const t = sp / (sp - sn);
        out.push({ x: p.x + (n.x - p.x) * t, y: p.y + (n.y - p.y) * t });
      }
    }
  }
  return out;
}

function polygonArea(p: Pt[]): number {
  let s = 0;
  for (let i = 0; i < p.length; i += 1) {
    const a = p[i];
    const b = p[(i + 1) % p.length];
    s += a.x * b.y - b.x * a.y;
  }
  return s / 2;
}

/** Area of the overlap of two convex quads. */
export function intersectionArea(a: Quad, b: Quad): number {
  return Math.abs(polygonArea(clip([...a], [...b])));
}

export function quadIoU(a: Quad, b: Quad): number {
  const inter = intersectionArea(a, b);
  const union = quadArea(a) + quadArea(b) - inter;
  return union > 0 ? inter / union : 0;
}

/**
 * Reduce candidate quads to the cards.
 *
 * - Near-duplicates (IoU > 0.5) keep the larger one.
 * - A quad mostly inside another is a card's inner box, so the outer wins...
 * - ...unless the outer holds two or more separate cards, in which case it
 *   is a binder page or a merged blob and is dropped instead.
 */
export function suppressNested(quads: Quad[], groupChildMin = 0.04): Quad[] {
  const sorted = [...quads].sort((a, b) => quadArea(b) - quadArea(a));
  const areas = sorted.map(quadArea);
  const inside = (child: number, parent: number) =>
    intersectionArea(sorted[child], sorted[parent]) > 0.8 * areas[child];

  // Children of each quad: smaller quads mostly inside it.
  const children = sorted.map((_, p) => {
    const out: number[] = [];
    for (let c = p + 1; c < sorted.length; c += 1) if (areas[c] < areas[p] * 0.95 && inside(c, p)) out.push(c);
    return out;
  });

  const dropped = new Set<number>();
  // Containers that hold several separate cards go first.
  for (let p = 0; p < sorted.length; p += 1) {
    const big = children[p].filter((c) => areas[c] >= areas[p] * groupChildMin);
    // Two descendants that are not nested in one another are two cards.
    const separate = big.some((c) => big.some((o) => o > c && !inside(c, o) && !inside(o, c)));
    if (separate) dropped.add(p);
  }
  for (let p = 0; p < sorted.length; p += 1) {
    if (dropped.has(p)) continue;
    for (const c of children[p]) dropped.add(c);
  }
  const kept: number[] = [];
  for (let i = 0; i < sorted.length; i += 1) {
    if (dropped.has(i)) continue;
    // Duplicates of something already kept (larger comes first).
    if (kept.some((k) => quadIoU(sorted[k], sorted[i]) > 0.5)) continue;
    kept.push(i);
  }
  return kept.map((i) => sorted[i]);
}

/** Top-to-bottom rows, left-to-right within a row. */
export function sortReadingOrder(quads: Quad[]): Quad[] {
  if (quads.length < 2) return [...quads];
  const heights = quads.map((q) => Math.max(...quadSides(q))).sort((a, b) => a - b);
  const rowGap = heights[Math.floor(heights.length / 2)] * 0.5;
  const byY = quads.map((q) => ({ q, c: centroid(q) })).sort((a, b) => a.c.y - b.c.y);
  const rows: { q: Quad; c: Pt }[][] = [];
  let rowMean = 0;
  for (const item of byY) {
    const row = rows[rows.length - 1];
    if (row && Math.abs(item.c.y - rowMean) <= rowGap) {
      row.push(item);
      rowMean = row.reduce((s, r) => s + r.c.y, 0) / row.length;
    } else {
      rows.push([item]);
      rowMean = item.c.y;
    }
  }
  return rows.flatMap((r) => r.sort((a, b) => a.c.x - b.c.x).map((r2) => r2.q));
}

/** Split sorted values into clusters wherever the gap exceeds `gap`. */
function cluster1d(values: number[], gap: number): number[][] {
  const sorted = [...values].sort((a, b) => a - b);
  const out: number[][] = [];
  for (const v of sorted) {
    const last = out[out.length - 1];
    if (last && v - last[last.length - 1] <= gap) last.push(v);
    else out.push([v]);
  }
  return out;
}

const mean = (v: number[]) => v.reduce((s, x) => s + x, 0) / v.length;
const median = (v: number[]) => [...v].sort((a, b) => a - b)[Math.floor(v.length / 2)];

/**
 * Cells of a regular grid that no detected quad covers.
 *
 * Needs four or more quads of similar size. Rows and columns are the clusters
 * of their centres; every row x column crossing without a quad is a missing
 * pocket, drawn as the median card shape moved to that crossing. Gives up
 * (returns []) when the quads do not sit on a grid: a loose table spread, a
 * tilted page where rows are not level, or under 60% of crossings occupied.
 */
export function inferGridCells(quads: Quad[]): Quad[] {
  if (quads.length < 4) return [];
  const areas = quads.map(quadArea);
  const medArea = median(areas);
  const regular = quads.filter((q) => Math.abs(quadArea(q) - medArea) < 0.35 * medArea);
  if (regular.length < 4) return [];

  const sides = regular.map((q) => quadSides(uprightQuad(q)));
  const w = median(sides.map((s) => s[0]));
  const h = median(sides.map((s) => s[1]));
  const centres = regular.map(centroid);

  const rows = cluster1d(centres.map((c) => c.y), h * 0.35);
  const cols = cluster1d(centres.map((c) => c.x), w * 0.35);
  if (rows.length < 2 || cols.length < 2) return [];
  const rowY = rows.map(mean);
  const colX = cols.map(mean);

  // Each quad must sit close to its lattice crossing, else this is not a grid.
  const nearest = (xs: number[], v: number) => xs.reduce((b, x) => (Math.abs(x - v) < Math.abs(b - v) ? x : b));
  for (const c of centres) {
    if (Math.abs(nearest(colX, c.x) - c.x) > w * 0.15 || Math.abs(nearest(rowY, c.y) - c.y) > h * 0.15) return [];
  }

  // Most crossings must hold a card, or the quads are just scattered.
  if (regular.length < 0.6 * rowY.length * colX.length) return [];

  // Median shape: corner offsets from the centre, over the regular quads.
  const proto = ([0, 1, 2, 3] as const).map((i) => ({
    x: median(regular.map((q, k) => q[i].x - centres[k].x)),
    y: median(regular.map((q, k) => q[i].y - centres[k].y)),
  }));

  const out: Quad[] = [];
  for (const y of rowY) {
    for (const x of colX) {
      const covered = quads.some((q) => {
        const c = centroid(q);
        return Math.abs(c.x - x) < w * 0.5 && Math.abs(c.y - y) < h * 0.5;
      });
      if (covered) continue;
      const cell = proto.map((p) => ({ x: x + p.x, y: y + p.y })) as Quad;
      // A cell that runs into a real card is not a pocket.
      if (quads.some((q) => intersectionArea(q, cell) > 0.1 * quadArea(cell))) continue;
      out.push(cell);
    }
  }
  return out;
}

/**
 * Does this quad hold anything, or just the sheet/pocket showing through?
 * A flat region has almost no luminance spread across its inner area.
 */
export function isBlankQuad(img: ImageData, q: Quad, minStd = 14): boolean {
  const samples: number[] = [];
  const n = 12;
  for (let i = 0; i < n; i += 1) {
    for (let j = 0; j < n; j += 1) {
      // Bilinear point inside the quad, kept off the edges.
      const u = 0.15 + (0.7 * (i + 0.5)) / n;
      const v = 0.15 + (0.7 * (j + 0.5)) / n;
      const x = (1 - v) * ((1 - u) * q[0].x + u * q[1].x) + v * ((1 - u) * q[3].x + u * q[2].x);
      const y = (1 - v) * ((1 - u) * q[0].y + u * q[1].y) + v * ((1 - u) * q[3].y + u * q[2].y);
      const xi = Math.round(x);
      const yi = Math.round(y);
      if (xi < 0 || yi < 0 || xi >= img.width || yi >= img.height) return true;
      const o = (yi * img.width + xi) * 4;
      samples.push(0.299 * img.data[o] + 0.587 * img.data[o + 1] + 0.114 * img.data[o + 2]);
    }
  }
  const m = mean(samples);
  const sd = Math.sqrt(mean(samples.map((s) => (s - m) ** 2)));
  return sd < minStd;
}

// ------------------------------------------------------------------ OpenCV

/** Candidate card quads (working-image pixels) from one binary map. */
function quadsFromBinary(cv: Cv, bin: Cv, minArea: number, maxArea: number, tol: number, mats: Cv[]): Quad[] {
  const contours = new cv.MatVector();
  const hierarchy = new cv.Mat();
  mats.push(contours, hierarchy);
  cv.findContours(bin, contours, hierarchy, cv.RETR_LIST, cv.CHAIN_APPROX_SIMPLE);
  const out: Quad[] = [];
  for (let i = 0; i < contours.size(); i += 1) {
    const cnt = contours.get(i);
    try {
      const area = cv.contourArea(cnt);
      if (area < minArea * 0.7 || area > maxArea) continue;
      const hull = new cv.Mat();
      try {
        cv.convexHull(cnt, hull, false, true);
        const hullArea = cv.contourArea(hull);
        if (!hullArea || area / hullArea < 0.85) continue;
        const peri = cv.arcLength(hull, true);
        let pts: Pt[] | null = null;
        for (const eps of [0.02, 0.03, 0.045, 0.065]) {
          const approx = new cv.Mat();
          cv.approxPolyDP(hull, approx, eps * peri, true);
          if (approx.rows === 4) {
            const d = approx.data32S;
            pts = [0, 1, 2, 3].map((k) => ({ x: d[k * 2], y: d[k * 2 + 1] }));
          }
          approx.delete();
          if (pts) break;
        }
        let quad = pts ? orderCorners(pts) : null;
        if (!quad || quadArea(quad) / hullArea < 0.88) {
          // Near-rectangular blob with no clean corners: use its tightest rectangle.
          const rect = cv.minAreaRect(hull);
          const box = cv.RotatedRect.points(rect) as Pt[];
          const boxQuad = orderCorners(box.map((p) => ({ x: p.x, y: p.y })));
          quad = boxQuad && hullArea / quadArea(boxQuad) > 0.88 ? boxQuad : null;
        }
        if (!quad) continue;
        const qa = quadArea(quad);
        if (qa < minArea || qa > maxArea) continue;
        if (!isCardShaped(quad, tol) && !isBlockShaped(quad)) continue;
        out.push(quad);
      } finally {
        hull.delete();
      }
    } finally {
      cnt.delete();
    }
  }
  return out;
}

/** Canny thresholds from the image's own median, so dark and bright shots both work. */
function medianOf(gray: Cv): number {
  const hist = new Array(256).fill(0);
  const d = gray.data as Uint8Array;
  for (let i = 0; i < d.length; i += 1) hist[d[i]] += 1;
  const half = Math.ceil(d.length / 2);
  let acc = 0;
  for (let v = 0; v < 256; v += 1) {
    acc += hist[v];
    if (acc >= half) return v;
  }
  return 128;
}

function candidateQuads(
  cv: Cv,
  work: ImageData,
  o: typeof DEFAULTS & DetectOptions,
  wholeOf: Map<Quad, Quad>,
): Quad[] {
  const mats: Cv[] = [];
  const track = <T>(m: T): T => {
    mats.push(m);
    return m;
  };
  try {
    const rgba = track(cv.matFromImageData(work));
    const gray = track(new cv.Mat());
    cv.cvtColor(rgba, gray, cv.COLOR_RGBA2GRAY);
    const blur = track(new cv.Mat());
    cv.GaussianBlur(gray, blur, new cv.Size(5, 5), 0);

    const frame = work.width * work.height;
    const minArea = frame * o.minAreaFraction;
    const maxArea = frame * o.maxAreaFraction;
    const kernel = track(cv.getStructuringElement(cv.MORPH_RECT, new cv.Size(3, 3)));
    const found: Quad[] = [];
    const run = (name: string, bin: Cv) => {
      const quads = quadsFromBinary(cv, bin, minArea, maxArea, o.aspectTolerance, mats);
      o.onCandidates?.(name, quads);
      found.push(...quads);
    };

    // Canny edges, closed so a card border becomes a ring. Several
    // sensitivities: a busy table needs strong edges only, a dim card weak ones.
    const med = medianOf(blur);
    let seamEdges: EdgeMap | null = null;
    for (const [name, k] of [["canny", 0.5], ["canny-strong", 1.2], ["canny-weak", 0.25]] as const) {
      const lo = Math.max(10, k * med);
      const edges = track(new cv.Mat());
      cv.Canny(blur, edges, lo, Math.max(30, lo * 2.5));
      if (name === "canny") seamEdges = { data: new Uint8Array(edges.data), width: work.width, height: work.height };
      const closed = track(new cv.Mat());
      cv.morphologyEx(edges, closed, cv.MORPH_CLOSE, kernel, new cv.Point(-1, -1), 2);
      run(name, closed);
    }

    // Edges in colour: a yellow border on a pink table has little luminance step.
    const channels = track(new cv.MatVector());
    cv.split(rgba, channels);
    const colourEdges = track(new cv.Mat());
    for (let c = 0; c < 3; c += 1) {
      const ch = channels.get(c);
      const chBlur = track(new cv.Mat());
      cv.GaussianBlur(ch, chBlur, new cv.Size(5, 5), 0);
      const e = track(new cv.Mat());
      const lo = Math.max(10, 0.8 * med);
      cv.Canny(chBlur, e, lo, Math.max(30, lo * 2.5));
      if (c === 0) e.copyTo(colourEdges);
      else cv.bitwise_or(colourEdges, e, colourEdges);
      ch.delete();
    }
    const colourClosed = track(new cv.Mat());
    cv.morphologyEx(colourEdges, colourClosed, cv.MORPH_CLOSE, kernel, new cv.Point(-1, -1), 2);
    run("canny-colour", colourClosed);

    // Local contrast threshold: finds cards whose edges Canny breaks up.
    const adaptive = track(new cv.Mat());
    cv.adaptiveThreshold(blur, adaptive, 255, cv.ADAPTIVE_THRESH_GAUSSIAN_C, cv.THRESH_BINARY_INV, 31, 8);
    const adaptiveClosed = track(new cv.Mat());
    cv.morphologyEx(adaptive, adaptiveClosed, cv.MORPH_CLOSE, kernel, new cv.Point(-1, -1), 2);
    run("adaptive", adaptiveClosed);

    // Global split, both polarities: a card on a plain table.
    for (const type of [cv.THRESH_BINARY, cv.THRESH_BINARY_INV]) {
      const otsu = track(new cv.Mat());
      cv.threshold(blur, otsu, 0, 255, type | cv.THRESH_OTSU);
      const opened = track(new cv.Mat());
      cv.morphologyEx(otsu, opened, cv.MORPH_OPEN, kernel, new cv.Point(-1, -1), 2);
      run(type === cv.THRESH_BINARY ? "otsu" : "otsu-inv", opened);
    }
    // Touching cards: split blocks along their seams; a block that does not
    // split stays only if it is itself card-shaped.
    const out: Quad[] = [];
    for (const q of found) {
      const cells = seamEdges ? splitBlock(seamEdges, q) : null;
      if (cells) {
        for (const c of cells) wholeOf.set(c, q);
        out.push(...cells);
      }
      else if (isCardShaped(q, o.aspectTolerance)) out.push(q);
    }
    return out;
  } finally {
    for (const m of mats) m.delete?.();
  }
}

function downscale(img: ImageData, longSide: number): { work: ImageData; scale: number } {
  const longest = Math.max(img.width, img.height);
  if (longest <= longSide) return { work: img, scale: 1 };
  const scale = longSide / longest;
  const w = Math.max(1, Math.round(img.width * scale));
  const h = Math.max(1, Math.round(img.height * scale));
  // Box average: cheap, and good enough for outlines.
  const out = new Uint8ClampedArray(w * h * 4);
  const sx = img.width / w;
  const sy = img.height / h;
  for (let y = 0; y < h; y += 1) {
    const y0 = Math.floor(y * sy);
    const y1 = Math.max(y0 + 1, Math.min(img.height, Math.floor((y + 1) * sy)));
    for (let x = 0; x < w; x += 1) {
      const x0 = Math.floor(x * sx);
      const x1 = Math.max(x0 + 1, Math.min(img.width, Math.floor((x + 1) * sx)));
      let r = 0;
      let g = 0;
      let b = 0;
      let n = 0;
      for (let yy = y0; yy < y1; yy += 1) {
        for (let xx = x0; xx < x1; xx += 1) {
          const i = (yy * img.width + xx) * 4;
          r += img.data[i];
          g += img.data[i + 1];
          b += img.data[i + 2];
          n += 1;
        }
      }
      const o = (y * w + x) * 4;
      out[o] = r / n;
      out[o + 1] = g / n;
      out[o + 2] = b / n;
      out[o + 3] = 255;
    }
  }
  return { work: { data: out, width: w, height: h, colorSpace: "srgb" } as ImageData, scale: w / img.width };
}

export type DetectedCard = {
  quad: Quad;
  /**
   * Set when this card was cut out of a block of touching cards: the block's
   * own outline (the same object for every cell). A block that is also
   * card-shaped might be one sideways card with a straight line through it,
   * so the caller can fall back to it if the cells identify as nothing.
   */
  whole?: Quad;
};

/**
 * Every card in the photo, in source-pixel coordinates and reading order.
 * Each quad is TL, TR, BR, BL with the long side running top to bottom.
 */
export function detectCards(cv: Cv, image: ImageData, opts: DetectOptions = {}): DetectedCard[] {
  const o = { ...DEFAULTS, ...opts };
  const { work, scale } = downscale(image, o.workEdge);

  const wholeOf = new Map<Quad, Quad>();
  // A flat interior is an empty pocket or a patch of table, not a card.
  const kept = suppressNested(candidateQuads(cv, work, o, wholeOf)).filter((q) => !isBlankQuad(work, q));
  const cards: DetectedCard[] = kept.map((q) => ({ quad: uprightQuad(q), whole: wholeOf.get(q) }));
  if (o.fillGrid) {
    const extra = inferGridCells(kept).filter((q) => !isBlankQuad(work, q));
    for (const q of extra) cards.push({ quad: uprightQuad(q) });
  }

  const order = new Map(cards.map((c) => [c.quad, c]));
  const back = (q: Quad) => q.map((p) => ({ x: p.x / scale, y: p.y / scale })) as Quad;
  const wholes = new Map<Quad, Quad>();
  const out = sortReadingOrder(cards.map((c) => c.quad)).map((q) => {
    const c = order.get(q)!;
    let whole: Quad | undefined;
    if (c.whole) {
      if (!wholes.has(c.whole)) wholes.set(c.whole, back(uprightQuad(c.whole)));
      whole = wholes.get(c.whole);
    }
    return { quad: back(q), whole };
  });

  if (!out.length && o.fallback) {
    const single = findCardQuad(image);
    if (single) return [{ quad: uprightQuad(single) }];
    const { width: w, height: h } = image;
    return [
      {
        quad: uprightQuad([
          { x: 0, y: 0 },
          { x: w - 1, y: 0 },
          { x: w - 1, y: h - 1 },
          { x: 0, y: h - 1 },
        ]),
      },
    ];
  }
  return out;
}

/**
 * Every card outline in the photo, in source-pixel coordinates.
 *
 * Each quad is TL, TR, BR, BL with the long side running top-to-bottom, and
 * the list is in reading order. With `fallback` (the default) a photo with no
 * detectable card yields the single-card guess, then the whole frame, so a
 * lone close-up still behaves as it did before multi-card scanning.
 */
export function findCardQuads(cv: Cv, image: ImageData, opts: DetectOptions = {}): Quad[] {
  return detectCards(cv, image, opts).map((c) => c.quad);
}
