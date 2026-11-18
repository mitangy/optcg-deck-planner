/** Identify a card by matching ORB features against precomputed references.
 *
 * Chosen over perceptual hashing after measurement, not preference: every
 * global-statistics hash tried (block, colour+gradient, dHash, edge-map,
 * ZNCC) held a roughly constant *percentile* as the reference pool grew, so
 * the right card was never reliably near the top at catalog scale. ORB held
 * rank 1 with margins intact across a 7.7x pool increase, including on
 * gold-foil cards that defeat OCR, because it scores geometric agreement
 * between two specific images rather than a position in a distribution.
 *
 * Descriptor matches lie constantly on cards — yellow borders match yellow
 * borders — so a match is only believed when one homography explains it:
 * Lowe ratio test, MAGSAC++ consensus, geometry sanity on both the matrix
 * and the projected card corners, scored by inlier count. Measured across
 * 3,690 wrong-card comparisons, no wrong card ever scored above zero, which
 * is what makes an early-exit threshold safe.
 */
import { quadArea, type Pt, type Quad } from "../geometry/cardRectify";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type Cv = any;

let cvPromise: Promise<Cv> | null = null;

/**
 * Load OpenCV on first use.
 *
 * Dynamically imported so the ~15 MB wasm build is code-split out of the
 * initial bundle: most visits never open the scanner, and making everyone
 * pay for it on page load would be a heavy cost for a feature they may not
 * use. The module also initialises asynchronously, so callers must await
 * this rather than touching `cv` directly.
 */
export async function getCv(): Promise<Cv> {
  if (!cvPromise) {
    cvPromise = (async () => {
      const mod = ((await import("@techstark/opencv-js")).default ?? {}) as Cv;
      if (mod instanceof Promise) return mod;
      if (mod.Mat) return mod;
      await new Promise<void>((resolve) => {
        mod.onRuntimeInitialized = () => resolve();
      });
      return mod;
    })().catch((err) => {
      cvPromise = null;
      throw err;
    });
  }
  return cvPromise;
}

export const ORB_FEATURES = 250;

export const QUERY_ORB_FEATURES = 500;
export const queryTuning = { claheClip: 3, features: QUERY_ORB_FEATURES };

const LOWE_RATIO = 0.8;
const RANSAC_REPROJ_PX = 5.0;
const MIN_GOOD_FOR_HOMOGRAPHY = 10;
const MIN_INLIERS = 8;

export type Extracted = { gray: Cv; kp: Cv; desc: Cv };

/**
 * Extract once, match many.
 *
 * Descriptor extraction dominates a naive per-pair call, and in a real
 * pipeline neither side pays it at query time: the query is extracted once
 * for the whole scan, and reference descriptors are precomputed offline
 * (~20 KB per card). Exposing extraction separately is what lets the harness
 * measure the cost that would actually be paid per candidate.
 */
export async function extractFeatures(image: ImageData, nFeatures = ORB_FEATURES): Promise<Extracted> {
  const cv = await getCv();
  return extract(cv, image, nFeatures);
}

/**
 * Query-side extraction for a rectified phone photo.
 *
 * Differs from the reference side in two measured ways: contrast-limited
 * adaptive histogram equalisation, because a card behind a sleeve or
 * toploader is hazy and ORB's corner detector fires on local contrast, and a
 * larger feature budget, because the query is extracted once per scan while
 * the references were extracted once per catalog. Real photos of sleeved
 * cards went from 13/19 to 19/19 reaching the confident threshold.
 */
export async function extractQueryFeatures(
  image: ImageData,
  nFeatures = queryTuning.features,
): Promise<Extracted> {
  const cv = await getCv();
  return extract(cv, image, nFeatures, queryTuning.claheClip);
}

export async function resizeToHeight(image: ImageData, height: number): Promise<ImageData> {
  if (image.height === height) return image;
  const cv = await getCv();
  const width = Math.max(1, Math.round((image.width * height) / image.height));
  const src = cv.matFromImageData(image);
  const dst = new cv.Mat();
  cv.resize(src, dst, new cv.Size(width, height), 0, 0, height < image.height ? cv.INTER_AREA : cv.INTER_CUBIC);
  const out = { data: new Uint8ClampedArray(dst.data), width, height, colorSpace: "srgb" } as ImageData;
  src.delete();
  dst.delete();
  return out;
}

export async function releaseFeatures(f: Extracted): Promise<void> {
  release(await getCv(), f);
}

function extract(cv: Cv, image: ImageData, nFeatures = ORB_FEATURES, claheClip = 0): Extracted {
  const mat = cv.matFromImageData(image);
  let gray = new cv.Mat();
  cv.cvtColor(mat, gray, cv.COLOR_RGBA2GRAY);
  mat.delete();
  if (claheClip > 0) {
    const clahe = new cv.CLAHE(claheClip, new cv.Size(8, 8));
    const equalised = new cv.Mat();
    clahe.apply(gray, equalised);
    gray.delete();
    gray = equalised;
    clahe.delete?.();
  }
  const orb = new cv.ORB(nFeatures);
  const kp = new cv.KeyPointVector();
  const desc = new cv.Mat();
  const mask = new cv.Mat();
  orb.detectAndCompute(gray, mask, kp, desc);
  mask.delete();
  orb.delete();
  return { gray, kp, desc };
}

function release(cv: Cv, e: Extracted): void {
  e.gray.delete();
  e.kp.delete();
  e.desc.delete();
}

export type OrbVerifyResult = {
  good: number;
  inliers: number;
  rejected:
    | "none"
    | "no-descriptors"
    | "too-few-good"
    | "no-homography"
    | "too-few-inliers"
    | "insane-homography"
    | "insane-quad";
  detail?: string;
};

export function saneHomographyReason(h: number[]): string | null {
  const det = h[0] * h[4] - h[1] * h[3];
  if (!Number.isFinite(det)) return "det-not-finite";
  if (det <= 1e-6) return `det-nonpositive(${det.toExponential(2)})`;
  const sx = Math.hypot(h[0], h[3]);
  const sy = Math.hypot(h[1], h[4]);
  if (!Number.isFinite(sx) || !Number.isFinite(sy)) return "scale-not-finite";
  if (sx < 1e-3 || sy < 1e-3) return `scale-collapsed(${sx.toExponential(2)},${sy.toExponential(2)})`;
  const ratio = sx / sy;
  if (ratio < 0.2 || ratio > 5) return `aspect(${ratio.toFixed(3)})`;
  if (Math.abs(h[6]) > 0.01 || Math.abs(h[7]) > 0.01) {
    return `projective(${h[6].toExponential(2)},${h[7].toExponential(2)})`;
  }
  return null;
}

/**
 * Check where the candidate's own corners actually land in the query.
 *
 * Inspecting the matrix alone is not enough: with 8 inliers on structure that
 * every OPTCG card shares (frames, text boxes, the bottom band) a numerically
 * unremarkable homography can still place the card somewhere absurd. Both
 * sides here are card images framed the same way, so a true match must map
 * the candidate roughly onto the query's own rectangle — convex, right way
 * round, similar area, not a sliver.
 */
function saneQuad(h: number[], candW: number, candH: number, queryW: number, queryH: number): boolean {
  const project = (x: number, y: number): Pt | null => {
    const d = h[6] * x + h[7] * y + h[8];
    if (!d || !Number.isFinite(d)) return null;
    const px = (h[0] * x + h[1] * y + h[2]) / d;
    const py = (h[3] * x + h[4] * y + h[5]) / d;
    return Number.isFinite(px) && Number.isFinite(py) ? { x: px, y: py } : null;
  };

  const projected = [
    project(0, 0),
    project(candW, 0),
    project(candW, candH),
    project(0, candH),
  ];
  if (projected.some((p) => p === null)) return false;
  const quad = projected as Quad;

  // Convex and consistently wound: every turn must go the same way. A mixed
  // sign means a bow-tie, which is a fitted-to-noise transform, not a card.
  let sign = 0;
  for (let i = 0; i < 4; i += 1) {
    const a = quad[i];
    const b = quad[(i + 1) % 4];
    const c = quad[(i + 2) % 4];
    const cross = (b.x - a.x) * (c.y - b.y) - (b.y - a.y) * (c.x - b.x);
    if (Math.abs(cross) < 1e-9) return false;
    const s = Math.sign(cross);
    if (sign === 0) sign = s;
    else if (s !== sign) return false;
  }

  const area = quadArea(quad);
  const queryArea = queryW * queryH;
  if (!queryArea) return false;
  const areaRatio = area / queryArea;
  if (areaRatio < 0.15 || areaRatio > 6) return false;

  const sides = [0, 1, 2, 3].map((i) => {
    const a = quad[i];
    const b = quad[(i + 1) % 4];
    return Math.hypot(b.x - a.x, b.y - a.y);
  });
  const minSide = Math.min(...sides);
  const maxSide = Math.max(...sides);
  if (maxSide <= 0 || minSide / maxSide < 0.15) return false;

  const margin = Math.max(queryW, queryH);
  if (quad.some((p) => p.x < -margin || p.x > queryW + margin || p.y < -margin || p.y > queryH + margin)) {
    return false;
  }

  return true;
}

export async function orbVerifyScore(query: ImageData, candidate: ImageData): Promise<OrbVerifyResult> {
  const cv = await getCv();
  const Q = extract(cv, query);
  const C = extract(cv, candidate);
  try {
    return await verifyFeatures(Q, C, query.width, query.height, candidate.width, candidate.height);
  } finally {
    release(cv, Q);
    release(cv, C);
  }
}

/**
 * A card's features in the form they are stored and shipped: a descriptor
 * matrix plus flat x,y pairs. Deliberately not a `KeyPointVector` — the
 * matcher only ever reads `.pt`, and descriptors arriving from a precomputed
 * bundle have no KeyPoint objects to rebuild.
 */
export type Features = { desc: Cv; pts: ArrayLike<number>; width: number; height: number };

export function toFeatures(e: Extracted, width: number, height: number): Features {
  const n = e.kp.size();
  const pts = new Float32Array(n * 2);
  for (let i = 0; i < n; i += 1) {
    const p = e.kp.get(i).pt;
    pts[i * 2] = p.x;
    pts[i * 2 + 1] = p.y;
  }
  return { desc: e.desc, pts, width, height };
}

export async function featuresFromBytes(
  descBytes: Uint8Array,
  pts: ArrayLike<number>,
  width: number,
  height: number,
): Promise<Features> {
  const cv = await getCv();
  const rows = descBytes.length / 32;
  const desc = cv.matFromArray(rows, 32, cv.CV_8U, Array.from(descBytes));
  return { desc, pts, width, height };
}

export async function verifyPair(q: Features, c: Features, reprojPx = RANSAC_REPROJ_PX): Promise<OrbVerifyResult> {
  const cv = await getCv();
  return verifyCore(cv, q.desc, q.pts, c.desc, c.pts, q.width, q.height, c.width, c.height, reprojPx);
}

export async function verifyFeatures(
  Q: Extracted,
  C: Extracted,
  queryW: number,
  queryH: number,
  candW: number,
  candH: number,
): Promise<OrbVerifyResult> {
  const cv = await getCv();
  return verifyCore(
    cv,
    Q.desc,
    toFeatures(Q, queryW, queryH).pts,
    C.desc,
    toFeatures(C, candW, candH).pts,
    queryW,
    queryH,
    candW,
    candH,
  );
}

async function verifyCore(
  cv: Cv,
  qDesc: Cv,
  qPts: ArrayLike<number>,
  cDesc: Cv,
  cPts: ArrayLike<number>,
  queryW: number,
  queryH: number,
  candW: number,
  candH: number,
  reprojPx = RANSAC_REPROJ_PX,
): Promise<OrbVerifyResult> {
  const fail = (rejected: OrbVerifyResult["rejected"], good = 0): OrbVerifyResult => ({
    good,
    inliers: 0,
    rejected,
  });

  if (qDesc.rows === 0 || cDesc.rows === 0) return fail("no-descriptors");

  const bf = new cv.BFMatcher(cv.NORM_HAMMING, false);
  const knn = new cv.DMatchVectorVector();
  bf.knnMatch(cDesc, qDesc, knn, 2);

  const srcPts: number[] = [];
  const dstPts: number[] = [];
  for (let i = 0; i < knn.size(); i += 1) {
    const pair = knn.get(i);
    if (pair.size() < 2) {
      pair.delete?.();
      continue;
    }
    const m = pair.get(0);
    const n = pair.get(1);
    if (m.distance < LOWE_RATIO * n.distance) {
      srcPts.push(cPts[m.queryIdx * 2], cPts[m.queryIdx * 2 + 1]);
      dstPts.push(qPts[m.trainIdx * 2], qPts[m.trainIdx * 2 + 1]);
    }
    pair.delete?.();
  }
  knn.delete();
  bf.delete();

  const good = srcPts.length / 2;
  if (good < MIN_GOOD_FOR_HOMOGRAPHY) return fail("too-few-good", good);

  const srcMat = cv.matFromArray(good, 1, cv.CV_32FC2, srcPts);
  const dstMat = cv.matFromArray(good, 1, cv.CV_32FC2, dstPts);
  const inlierMask = new cv.Mat();
  let h: Cv | null = null;
  try {
    h = cv.findHomography(srcMat, dstMat, cv.USAC_MAGSAC, reprojPx, inlierMask);
  } catch {
    h = null;
  }

  let result: OrbVerifyResult;
  if (!h || h.empty?.() || h.rows !== 3) {
    result = { good, inliers: 0, rejected: "no-homography" };
  } else {
    let inliers = 0;
    for (let i = 0; i < inlierMask.rows; i += 1) {
      if (inlierMask.data[i]) inliers += 1;
    }
    const hv = Array.from({ length: 9 }, (_, i) => h.doubleAt(Math.floor(i / 3), i % 3));
    const hReason = saneHomographyReason(hv);
    if (inliers < MIN_INLIERS) result = { good, inliers, rejected: "too-few-inliers" };
    else if (hReason) result = { good, inliers, rejected: "insane-homography", detail: hReason };
    else if (!saneQuad(hv, candW, candH, queryW, queryH)) {
      result = { good, inliers, rejected: "insane-quad" };
    } else result = { good, inliers, rejected: "none" };
  }

  h?.delete?.();
  inlierMask.delete();
  srcMat.delete();
  dstMat.delete();
  return result;
}
