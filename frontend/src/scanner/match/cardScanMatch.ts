
import { findCardQuad, rectifyToCanvas } from "../geometry/cardRectify";
import {
  extractQueryFeatures,
  featuresFromBytes,
  resizeToHeight,
  releaseFeatures,
  toFeatures,
  verifyPair,
  type Features,
} from "./cardMatch";
import { computeOrderHash, orderDistance } from "../geometry/cardOrder";
import { loadAllRecords, type DescriptorManifest, type DescriptorRecord } from "./descriptorCache";
import { embeddingScores, fuseOrder, getScanEmbedder, rankIndices } from "./cardEmbed";
import { scanLog } from "../runtime/scanLog";

export const CONFIDENT_INLIERS = 10;

export const SURE_LEAD = 5;

export type ScanCandidate = {
  cardId: string;
  label: string;
  features: Features;
  orderHash: string;
  embedding?: Int8Array;
};

export type ScanMatch = {
  cardId: string;
  label: string;
  inliers: number;
  examined: number;
  runnerUp: number;
  embedRank?: number;
};

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

export async function loadCandidates(manifest: DescriptorManifest): Promise<ScanCandidate[]> {
  return buildCandidates(await loadAllRecords(manifest));
}

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

export async function matchCard(
  photo: ImageData,
  candidates: ScanCandidate[],
  onProgress?: (examined: number, total: number) => void,
): Promise<ScanMatch | null> {
  const { pixels, rectified } = rectifyForScan(photo);
  scanLog("scan:rectify", rectified ? "card outline found" : "no outline, using full frame");
  return matchRectified(pixels, candidates, onProgress);
}

export type WalkPolicy = {
  minExamined: number;
  confirmCap: number;
  maxMs: number;
};

export const DEFAULT_WALK: WalkPolicy = { minExamined: 8, confirmCap: 48, maxMs: 1500 };

export const MATCH_HEIGHT = 560;

export type StopReason = "sure" | "confirm-cap" | "budget" | "exhausted";

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

export function orderByHash<T extends { orderHash: string }>(candidates: T[], queryHash: string): T[] {
  return candidates
    .map((c, i) => ({ c, i, d: c.orderHash ? orderDistance(queryHash, c.orderHash) : Number.MAX_SAFE_INTEGER }))
    .sort((a, b) => a.d - b.d || a.i - b.i)
    .map((x) => x.c);
}

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
