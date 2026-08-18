/** Prototype: ORB feature matching, to test whether it survives foil glare
 * better than block-average hashing does. Dev-only experiment — not wired
 * into production matching, and @techstark/opencv-js is a devDependency.
 *
 * Two scorers live here so the harness can A/B them on identical inputs:
 *
 *  - `orbMatchScore` — the original: count mutually-nearest descriptor pairs
 *    under a fixed Hamming threshold.
 *  - `orbVerifyScore` — the mDex/FORB verifier: Lowe ratio test, then insist
 *    a single homography explains the surviving matches, then sanity-check
 *    that homography, and score by *inlier count*. Descriptor matches lie
 *    constantly on cards (yellow borders match yellow borders); requiring one
 *    consistent perspective transform is what separates a real match from
 *    coincidence, since a wrong card produces no consensus.
 */
import cvModule from "@techstark/opencv-js";
import { quadArea, type Pt, type Quad } from "../cardRectify";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Cv = any;

let cvPromise: Promise<Cv> | null = null;

async function getCv(): Promise<Cv> {
  if (!cvPromise) {
    cvPromise = (async () => {
      const mod = cvModule as unknown as Cv;
      if (mod instanceof Promise) return mod;
      if (mod.Mat) return mod;
      await new Promise<void>((resolve) => {
        mod.onRuntimeInitialized = () => resolve();
      });
      return mod;
    })();
  }
  return cvPromise;
}

export type OrbResult = { goodMatches: number; avgDistance: number; totalMatches: number };

/** Distance below this (out of a max 256 for the 32-byte ORB descriptor) counts as a real match. */
const GOOD_MATCH_MAX_DISTANCE = 48;

const ORB_FEATURES = 500;

/** Lowe's ratio: keep a match only if it clearly beats the runner-up. */
const LOWE_RATIO = 0.8;
/** Reprojection tolerance in pixels for homography inliers. */
const RANSAC_REPROJ_PX = 5.0;
/** Too few ratio-test survivors to bother fitting a transform. */
const MIN_GOOD_FOR_HOMOGRAPHY = 10;
/** Fewer inliers than this is noise, not a consensus. */
const MIN_INLIERS = 8;

type Extracted = { gray: Cv; kp: Cv; desc: Cv };

function extract(cv: Cv, image: ImageData): Extracted {
  const mat = cv.matFromImageData(image);
  const gray = new cv.Mat();
  cv.cvtColor(mat, gray, cv.COLOR_RGBA2GRAY);
  mat.delete();
  const orb = new cv.ORB(ORB_FEATURES);
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

export async function orbMatchScore(a: ImageData, b: ImageData): Promise<OrbResult> {
  const cv = await getCv();
  const A = extract(cv, a);
  const B = extract(cv, b);

  let goodMatches = 0;
  let totalMatches = 0;
  let avgDistance = Infinity;

  if (A.desc.rows > 0 && B.desc.rows > 0) {
    const bf = new cv.BFMatcher(cv.NORM_HAMMING, true);
    const matchVec = new cv.DMatchVector();
    bf.match(A.desc, B.desc, matchVec);
    totalMatches = matchVec.size();
    const distances: number[] = [];
    for (let i = 0; i < matchVec.size(); i += 1) distances.push(matchVec.get(i).distance);
    const good = distances.filter((d) => d <= GOOD_MATCH_MAX_DISTANCE);
    goodMatches = good.length;
    avgDistance = good.length ? good.reduce((s, d) => s + d, 0) / good.length : Infinity;
    matchVec.delete();
    bf.delete();
  }

  release(cv, A);
  release(cv, B);
  return { goodMatches, avgDistance, totalMatches };
}

export type OrbVerifyResult = {
  /** Matches surviving Lowe's ratio test. */
  good: number;
  /** Matches explained by one homography — the score that decides a match. */
  inliers: number;
  /** Why it bailed out early, for diagnostics. */
  rejected:
    | "none"
    | "no-descriptors"
    | "too-few-good"
    | "no-homography"
    | "too-few-inliers"
    | "insane-homography"
    | "insane-quad";
  /** Which specific sub-check fired, when one did. */
  detail?: string;
};

/**
 * Reject flips, slivers and impossible warps — a real card cannot project
 * like that. Returns the failing check's name, or null when the matrix is
 * plausible, so the harness can say *why* a match was thrown out instead of
 * leaving a threshold to be guessed at.
 */
export function saneHomographyReason(h: number[]): string | null {
  // Determinant of the 2x2 linear part: negative means a mirror flip, and a
  // near-zero magnitude means the card collapsed to a sliver.
  const det = h[0] * h[4] - h[1] * h[3];
  if (!Number.isFinite(det)) return "det-not-finite";
  if (det <= 1e-6) return `det-nonpositive(${det.toExponential(2)})`;
  // Extreme anisotropic scaling is not a card viewed at an angle.
  const sx = Math.hypot(h[0], h[3]);
  const sy = Math.hypot(h[1], h[4]);
  if (!Number.isFinite(sx) || !Number.isFinite(sy)) return "scale-not-finite";
  if (sx < 1e-3 || sy < 1e-3) return `scale-collapsed(${sx.toExponential(2)},${sy.toExponential(2)})`;
  const ratio = sx / sy;
  if (ratio < 0.2 || ratio > 5) return `aspect(${ratio.toFixed(3)})`;
  // A strong projective component means the plane is folding away implausibly.
  // Note these terms scale as 1/pixels, so the bound depends on image size —
  // measured rather than assumed, see the harness diagnostics.
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

  // Area within a sane band of the query's own area (shoelace, reused from
  // cardRectify so there is one implementation of this).
  const area = quadArea(quad);
  const queryArea = queryW * queryH;
  if (!queryArea) return false;
  const areaRatio = area / queryArea;
  if (areaRatio < 0.15 || areaRatio > 6) return false;

  // No sliver: the shortest edge cannot be a tiny fraction of the longest.
  const sides = [0, 1, 2, 3].map((i) => {
    const a = quad[i];
    const b = quad[(i + 1) % 4];
    return Math.hypot(b.x - a.x, b.y - a.y);
  });
  const minSide = Math.min(...sides);
  const maxSide = Math.max(...sides);
  if (maxSide <= 0 || minSide / maxSide < 0.15) return false;

  // Corners may spill outside the frame (a card can be partly cropped), but
  // not by multiples of the frame.
  const margin = Math.max(queryW, queryH);
  if (quad.some((p) => p.x < -margin || p.x > queryW + margin || p.y < -margin || p.y > queryH + margin)) {
    return false;
  }

  return true;
}

/**
 * Score a pair the way mDex/FORB does: ratio test, one-homography
 * consensus, sanity checks, and the inlier count as the score.
 */
export async function orbVerifyScore(query: ImageData, candidate: ImageData): Promise<OrbVerifyResult> {
  const cv = await getCv();
  const Q = extract(cv, query);
  const C = extract(cv, candidate);

  const fail = (rejected: OrbVerifyResult["rejected"], good = 0): OrbVerifyResult => {
    release(cv, Q);
    release(cv, C);
    return { good, inliers: 0, rejected };
  };

  if (Q.desc.rows === 0 || C.desc.rows === 0) return fail("no-descriptors");

  // knnMatch with k=2 so each candidate keypoint has a runner-up to compare
  // against — that comparison *is* the ratio test.
  const bf = new cv.BFMatcher(cv.NORM_HAMMING, false);
  const knn = new cv.DMatchVectorVector();
  bf.knnMatch(C.desc, Q.desc, knn, 2);

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
      const cKp = C.kp.get(m.queryIdx).pt;
      const qKp = Q.kp.get(m.trainIdx).pt;
      srcPts.push(cKp.x, cKp.y);
      dstPts.push(qKp.x, qKp.y);
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
    h = cv.findHomography(srcMat, dstMat, cv.USAC_MAGSAC, RANSAC_REPROJ_PX, inlierMask);
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
    else if (!saneQuad(hv, candidate.width, candidate.height, query.width, query.height)) {
      result = { good, inliers, rejected: "insane-quad" };
    } else result = { good, inliers, rejected: "none" };
  }

  h?.delete?.();
  inlierMask.delete();
  srcMat.delete();
  dstMat.delete();
  release(cv, Q);
  release(cv, C);
  return result;
}
