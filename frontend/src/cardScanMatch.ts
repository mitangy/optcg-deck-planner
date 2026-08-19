/** Identify the card in a photo, entirely on-device.
 *
 * rectify -> extract query features -> order candidates by a cheap hash ->
 * ORB-verify in that order, stopping at the first confident match.
 *
 * Nothing is truncated: the walk can reach every candidate, so the ordering
 * only affects how quickly the answer is found, never whether it is found.
 * Correctness rests on the verifier, which across 3,690 wrong-card
 * comparisons never scored a wrong card above zero.
 */

import { findCardQuad, rectifyToCanvas } from "./cardRectify";
import {
  ORB_FEATURES,
  extractFeatures,
  featuresFromBytes,
  releaseFeatures,
  toFeatures,
  verifyPair,
  type Features,
} from "./cardMatch";
import { computeOrderHash, orderDistance } from "./cardOrder";
import { loadAllRecords, type DescriptorManifest, type DescriptorRecord } from "./descriptorCache";
import { scanLog } from "./scanLog";

/**
 * Inliers at or above this stop the walk.
 *
 * Correct matches scored 12-18 while every wrong card scored 0, so this sits
 * in an empty gap rather than on a contested boundary.
 */
const CONFIDENT_INLIERS = 10;

export type ScanCandidate = {
  cardId: string;
  label: string;
  features: Features;
  orderHash: string;
};

export type ScanMatch = {
  cardId: string;
  label: string;
  inliers: number;
  /** How many candidates were verified before stopping — for diagnostics. */
  examined: number;
  /** Best score from any *other* card, so the caller can judge separation. */
  runnerUp: number;
};

/**
 * Prepare cached descriptor records for matching.
 *
 * Builds OpenCV matrices, so the result owns WASM memory and must be
 * released with `releaseCandidates`.
 */
export async function buildCandidates(records: DescriptorRecord[]): Promise<ScanCandidate[]> {
  const out: ScanCandidate[] = [];
  for (const r of records) {
    out.push({
      cardId: r.cardId,
      label: r.label,
      orderHash: r.orderHash,
      features: await featuresFromBytes(r.descriptors, r.points, r.width, r.height),
    });
  }
  return out;
}

export async function releaseCandidates(candidates: ScanCandidate[]): Promise<void> {
  for (const c of candidates) c.features.desc.delete?.();
}

/** Load every cached record and prepare it for matching. */
export async function loadCandidates(manifest: DescriptorManifest): Promise<ScanCandidate[]> {
  return buildCandidates(await loadAllRecords(manifest));
}

/** Rectify to a canonical card if the outline can be found, else use the frame as-is. */
export function rectifyForScan(source: ImageData): { pixels: ImageData; rectified: boolean } {
  const quad = findCardQuad(source);
  if (quad) {
    const rect = rectifyToCanvas(source, quad);
    const ctx = rect?.getContext("2d");
    if (rect && ctx) {
      return { pixels: ctx.getImageData(0, 0, rect.width, rect.height), rectified: true };
    }
  }
  return { pixels: source, rectified: false };
}

/**
 * Match a photo against prepared candidates.
 *
 * `onProgress` reports how far the walk has gone, since a cold cache or an
 * unlucky ordering can make this take a second or two.
 */
export async function matchCard(
  photo: ImageData,
  candidates: ScanCandidate[],
  onProgress?: (examined: number, total: number) => void,
): Promise<ScanMatch | null> {
  const { pixels, rectified } = rectifyForScan(photo);
  scanLog("scan:rectify", rectified ? "card outline found" : "no outline, using full frame");

  const extracted = await extractFeatures(pixels, ORB_FEATURES);
  const query = toFeatures(extracted, pixels.width, pixels.height);

  try {
    const queryHash = computeOrderHash(pixels);
    const ordered = candidates
      .map((c) => ({ c, d: c.orderHash ? orderDistance(queryHash, c.orderHash) : Number.MAX_SAFE_INTEGER }))
      .sort((a, b) => a.d - b.d);

    let best: ScanMatch | null = null;
    let runnerUp = 0;
    for (let i = 0; i < ordered.length; i += 1) {
      const cand = ordered[i].c;
      const v = await verifyPair(query, cand.features);
      const score = v.rejected === "none" ? v.inliers : 0;
      if (score > (best?.inliers ?? 0)) {
        if (best) runnerUp = Math.max(runnerUp, best.inliers);
        best = {
          cardId: cand.cardId,
          label: cand.label,
          inliers: score,
          examined: i + 1,
          runnerUp,
        };
      } else if (score > runnerUp && cand.cardId !== best?.cardId) {
        runnerUp = score;
        if (best) best.runnerUp = runnerUp;
      }
      if (i % 50 === 49) onProgress?.(i + 1, ordered.length);
      // Stop as soon as a match is unambiguous; the gap between a real match
      // and everything else is wide enough that continuing cannot change it.
      if (best && best.inliers >= CONFIDENT_INLIERS) {
        scanLog("scan:match", `${best.cardId} inliers=${best.inliers} after ${i + 1}`);
        return best;
      }
    }
    if (best) scanLog("scan:weak", `${best.cardId} inliers=${best.inliers} (below ${CONFIDENT_INLIERS})`);
    else scanLog("scan:no-match", `examined ${ordered.length}`);
    return best && best.inliers > 0 ? best : null;
  } finally {
    await releaseFeatures(extracted);
  }
}
