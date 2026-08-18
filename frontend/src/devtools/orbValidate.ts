/** ORB scoring for the validation cases, using the mDex/FORB verifier:
 * Lowe ratio test, one-homography consensus (MAGSAC++), geometry sanity
 * checks, scored by inlier count.
 *
 * One `orbVerifyScore` call per pair rather than two — the ratio-test
 * survivor count it already returns serves as the descriptor-only signal, so
 * the old separate `orbMatchScore` pass is redundant here and doubled the
 * (dominant) cost of this run.
 */

import { hashPhoto, loadImageData, type RefImage, type ValidationCase } from "./hashValidate";
import { orbVerifyScore } from "./orbMatch";

export type OrbVerifyInfo = {
  label: string;
  cardId: string;
  /** Score: inliers when every check passed, else 0 so it cannot outrank a real fit. */
  inliers: number;
  /** Ratio-test survivors — the descriptor-only signal, used as a tie-break. */
  good: number;
  rejected: string;
};

export type OrbCaseReport = {
  label: string;
  correct: OrbVerifyInfo | null;
  best: OrbVerifyInfo | null;
  runnerUp: OrbVerifyInfo | null;
  correctIsBest: boolean;
  correctRank: number | null;
  totalCandidates: number;
  /** Candidates that passed every geometric check. */
  survivors: number;
  msPerCandidate: number;
};

export async function runOrbValidation(
  cases: ValidationCase[],
  refs: RefImage[],
): Promise<OrbCaseReport[]> {
  const reports: OrbCaseReport[] = [];
  for (const c of cases) {
    const started = performance.now();
    // Same rectify-or-fallback crop the hashes use, so only the scoring differs.
    const photo = await hashPhoto(c.photoUrl);
    const photoImg = await loadImageData(photo.previewUrl);

    const scored: OrbVerifyInfo[] = [];
    for (const r of refs) {
      const refImg = await loadImageData(r.url);
      const v = await orbVerifyScore(photoImg, refImg);
      scored.push({
        label: r.label,
        cardId: r.cardId,
        inliers: v.rejected === "none" ? v.inliers : 0,
        good: v.good,
        rejected: v.rejected,
      });
    }

    // Geometry first, descriptor count second: a verified match always beats
    // an unverified one, but when geometry fits nothing this degrades to the
    // descriptor ranking instead of throwing the answer away.
    scored.sort((a, b) => b.inliers - a.inliers || b.good - a.good);

    const correctIndex = scored.findIndex((s) => s.cardId === c.correctCardId);
    reports.push({
      label: c.label,
      correct: correctIndex >= 0 ? scored[correctIndex] : null,
      best: scored[0] ?? null,
      runnerUp: scored[1] ?? null,
      correctIsBest: scored[0]?.cardId === c.correctCardId,
      correctRank: correctIndex >= 0 ? correctIndex + 1 : null,
      totalCandidates: scored.length,
      survivors: scored.filter((s) => s.rejected === "none").length,
      msPerCandidate: (performance.now() - started) / Math.max(1, refs.length),
    });
  }
  return reports;
}
