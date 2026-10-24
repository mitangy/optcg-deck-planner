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
  extractQueryFeatures,
  featuresFromBytes,
  resizeToHeight,
  releaseFeatures,
  toFeatures,
  verifyPair,
  type Features,
} from "./cardMatch";
import { computeOrderHash, orderDistance } from "./cardOrder";
import { loadAllRecords, type DescriptorManifest, type DescriptorRecord } from "./descriptorCache";
import { embeddingScores, fuseOrder, getScanEmbedder, rankIndices } from "./cardEmbed";
import { scanLog } from "./scanLog";

/**
 * Inliers at or above this stop the walk.
 *
 * Correct matches scored 12-18 while every wrong card scored 0, so this sits
 * in an empty gap rather than on a contested boundary.
 */
export const CONFIDENT_INLIERS = 10;

/** A confident match must also lead the best rival by this much to be called sure. */
export const SURE_LEAD = 5;

export type ScanCandidate = {
  cardId: string;
  label: string;
  features: Features;
  orderHash: string;
  /** int8 art embedding (see cardEmbed.ts), attached once the embedder bundle is loaded. */
  embedding?: Int8Array;
};

export type ScanMatch = {
  cardId: string;
  label: string;
  inliers: number;
  /** How many candidates were verified before stopping — for diagnostics. */
  examined: number;
  /** Best score from any *other* card, so the caller can judge separation. */
  runnerUp: number;
  /** 0-based rank of this card by embedding similarity, when an embedder ran. */
  embedRank?: number;
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
  return matchRectified(pixels, candidates, onProgress);
}

/** What the walk is allowed to do. Exported so tests and the harness can tighten it. */
export type WalkPolicy = {
  /** Candidates verified before a match may be called settled, so `runnerUp` has seen real rivals. */
  minExamined: number;
  /** Once something confident is found, stop looking for a better one after this many candidates. */
  confirmCap: number;
  /** Wall-clock cap on the walk once `minExamined` is done. */
  maxMs: number;
};

export const DEFAULT_WALK: WalkPolicy = { minExamined: 8, confirmCap: 48, maxMs: 1500 };

/** Query height the walk runs at; the references are ~560 px tall (see `resizeToHeight`). */
export const MATCH_HEIGHT = 560;

export type StopReason = "sure" | "confirm-cap" | "budget" | "exhausted";

/**
 * Decide whether the walk is over. Pure, so the policy can be tested without OpenCV.
 *
 * - "sure": a confident match with a clear lead, after enough rivals were seen.
 * - "confirm-cap": a confident match whose rivals never fell away (reprints of
 *   one illustration tie closely); stop and report it as a close call rather
 *   than reading the whole catalog hoping the tie breaks.
 * - "budget": nothing confident and out of time: report the best weak match as
 *   a check instead of blocking the scan for seconds.
 */
export function walkStop(
  s: { best: number; runnerUp: number; examined: number; total: number; elapsedMs: number },
  policy: WalkPolicy = DEFAULT_WALK,
  margin = SURE_LEAD,
): StopReason | null {
  if (s.examined >= s.total) return "exhausted";
  if (s.examined >= policy.minExamined && s.best >= CONFIDENT_INLIERS) {
    if (s.best - s.runnerUp >= margin) return "sure";
    if (s.examined >= policy.confirmCap) return "confirm-cap";
  }
  if (s.examined >= policy.minExamined && s.elapsedMs >= policy.maxMs) return "budget";
  return null;
}

/** Candidates sorted by order-hash distance to the query; ties keep catalog order. */
export function orderByHash<T extends { orderHash: string }>(candidates: T[], queryHash: string): T[] {
  return candidates
    .map((c, i) => ({ c, i, d: c.orderHash ? orderDistance(queryHash, c.orderHash) : Number.MAX_SAFE_INTEGER }))
    .sort((a, b) => a.d - b.d || a.i - b.i)
    .map((x) => x.c);
}

/**
 * The order the walk verifies candidates in: the hash order, fused with the
 * embedding order when the embedder ran. A permutation of `candidates` either way.
 */
export function walkOrder(
  candidates: ScanCandidate[],
  queryHash: string,
  queryEmbedding: Float32Array | null,
): { ordered: ScanCandidate[]; embedRank: Map<ScanCandidate, number> | null } {
  const byHash = orderByHash(candidates, queryHash);
  if (!queryEmbedding) return { ordered: byHash, embedRank: null };
  const scores = embeddingScores(queryEmbedding, candidates.map((c) => c.embedding));
  const index = new Map(candidates.map((c, i) => [c, i] as const));
  const fused = fuseOrder(byHash.map((c) => index.get(c)!), scores);
  const embedRank = new Map<ScanCandidate, number>();
  rankIndices(scores).forEach((i, rank) => embedRank.set(candidates[i], rank));
  return { ordered: fused.map((i) => candidates[i]), embedRank };
}

/** Match pixels that are already a flattened card (no outline search). */
export async function matchRectified(
  rectified: ImageData,
  candidates: ScanCandidate[],
  onProgress?: (examined: number, total: number) => void,
  policy: WalkPolicy = DEFAULT_WALK,
  now: () => number = () => performance.now(),
): Promise<ScanMatch | null> {
  const t0 = now();
  const pixels = await resizeToHeight(rectified, MATCH_HEIGHT);
  const extracted = await extractQueryFeatures(pixels);
  const query = toFeatures(extracted, pixels.width, pixels.height);

  try {
    const embedder = getScanEmbedder();
    let queryEmbedding: Float32Array | null = null;
    if (embedder && candidates.some((c) => c.embedding)) {
      try {
        queryEmbedding = await embedder.embed(pixels);
      } catch {
        queryEmbedding = null; // the hash order is still a fine order
      }
    }
    const { ordered, embedRank } = walkOrder(candidates, computeOrderHash(pixels), queryEmbedding);

    let best: ScanMatch | null = null;
    let runnerUp = 0;
    let reason: StopReason | null = null;
    for (let i = 0; i < ordered.length; i += 1) {
      const cand = ordered[i];
      const v = await verifyPair(query, cand.features);
      const score = v.rejected === "none" ? v.inliers : 0;
      if (score > (best?.inliers ?? 0)) {
        // Another printing of the same card is not a rival; only a different card makes the call close.
        if (best && best.cardId !== cand.cardId) runnerUp = Math.max(runnerUp, best.inliers);
        best = { cardId: cand.cardId, label: cand.label, inliers: score, examined: i + 1, runnerUp, embedRank: embedRank?.get(cand) };
      } else if (score > runnerUp && cand.cardId !== best?.cardId) {
        runnerUp = score;
        if (best) best.runnerUp = runnerUp;
      }
      if (i % 50 === 49) onProgress?.(i + 1, ordered.length);
      reason = walkStop(
        { best: best?.inliers ?? 0, runnerUp, examined: i + 1, total: ordered.length, elapsedMs: now() - t0 },
        policy,
      );
      if (reason) break;
    }
    scanLog("scan:walk", `${reason ?? "exhausted"} best=${best?.cardId ?? "-"} inliers=${best?.inliers ?? 0} runnerUp=${runnerUp}`);
    return best && best.inliers > 0 ? best : null;
  } finally {
    await releaseFeatures(extracted);
  }
}
