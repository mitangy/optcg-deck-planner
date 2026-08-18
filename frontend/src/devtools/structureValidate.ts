/** Scores the same validation cases/refs with edge-map hashing and with
 * ZNCC, side by side, so both can be compared against the existing
 * block-hash and ORB numbers from one harness run.
 */

import { findCardQuad, rectifyToCanvas } from "../cardRectify";
import type { PixelSource } from "../imageHash";
import { loadImageData, type RefImage, type ValidationCase } from "./hashValidate";
import { computeEdgeHash, edgeHashDistance, zncc, znccThumbnail } from "./structureMatch";

type Prepared = { edgeHash: string; thumb: Float64Array; rectified: boolean };

async function prepare(url: string): Promise<Prepared> {
  const data = await loadImageData(url);
  const quad = findCardQuad(data);
  let pixels: PixelSource = data;
  let rectified = false;
  if (quad) {
    const rect = rectifyToCanvas(data, quad);
    const ctx = rect?.getContext("2d");
    if (rect && ctx) {
      pixels = ctx.getImageData(0, 0, rect.width, rect.height);
      rectified = true;
    }
  }
  return { edgeHash: computeEdgeHash(pixels), thumb: znccThumbnail(pixels), rectified };
}

export type StructureReport = {
  label: string;
  rectified: boolean;
  edgeCorrectDistance: number | null;
  edgeCorrectRank: number | null;
  edgeBestLabel: string | null;
  edgeBestDistance: number | null;
  edgeCorrectIsBest: boolean;
  znccCorrectScore: number | null;
  znccCorrectRank: number | null;
  znccBestLabel: string | null;
  znccBestScore: number | null;
  znccRunnerUpScore: number | null;
  znccCorrectIsBest: boolean;
  totalCandidates: number;
};

export async function runStructureValidation(
  cases: ValidationCase[],
  refs: RefImage[],
): Promise<StructureReport[]> {
  const prepared = await Promise.all(
    refs.map(async (r) => ({ label: r.label, cardId: r.cardId, ...(await prepare(r.url)) })),
  );

  const reports: StructureReport[] = [];
  for (const c of cases) {
    const photo = await prepare(c.photoUrl);

    const edgeRanked = prepared
      .map((r) => ({
        label: r.label,
        cardId: r.cardId,
        distance: edgeHashDistance(photo.edgeHash, r.edgeHash),
      }))
      .sort((a, b) => a.distance - b.distance);
    const edgeCorrectIndex = edgeRanked.findIndex((d) => d.cardId === c.correctCardId);

    // Higher ZNCC is better, so this list sorts descending.
    const znccRanked = prepared
      .map((r) => ({ label: r.label, cardId: r.cardId, score: zncc(photo.thumb, r.thumb) }))
      .sort((a, b) => b.score - a.score);
    const znccCorrectIndex = znccRanked.findIndex((d) => d.cardId === c.correctCardId);

    reports.push({
      label: c.label,
      rectified: photo.rectified,
      edgeCorrectDistance: edgeCorrectIndex >= 0 ? edgeRanked[edgeCorrectIndex].distance : null,
      edgeCorrectRank: edgeCorrectIndex >= 0 ? edgeCorrectIndex + 1 : null,
      edgeBestLabel: edgeRanked[0]?.label ?? null,
      edgeBestDistance: edgeRanked[0]?.distance ?? null,
      edgeCorrectIsBest: edgeRanked[0]?.cardId === c.correctCardId,
      znccCorrectScore: znccCorrectIndex >= 0 ? znccRanked[znccCorrectIndex].score : null,
      znccCorrectRank: znccCorrectIndex >= 0 ? znccCorrectIndex + 1 : null,
      znccBestLabel: znccRanked[0]?.label ?? null,
      znccBestScore: znccRanked[0]?.score ?? null,
      znccRunnerUpScore: znccRanked[1]?.score ?? null,
      znccCorrectIsBest: znccRanked[0]?.cardId === c.correctCardId,
      totalCandidates: prepared.length,
    });
  }
  return reports;
}
