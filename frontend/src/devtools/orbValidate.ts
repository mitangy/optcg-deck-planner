/** Same validation cases/refs, scored by ORB feature matching — both the
 * original good-match count and the mDex/FORB homography verifier, so the
 * upgrade can be judged against the old numbers on identical inputs.
 */

import { hashPhoto, loadImageData, type RefImage, type ValidationCase } from "./hashValidate";
import { orbMatchScore, orbVerifyScore } from "./orbMatch";

export type OrbMatchInfo = { label: string; goodMatches: number; avgDistance: number };
/** `inliers` is the *score*: zero when any sanity check rejected the fit, so a
 *  rejected candidate can never outrank an accepted one. */
export type OrbVerifyInfo = { label: string; inliers: number; good: number; rejected: string };

export type OrbCaseReport = {
  label: string;
  correct: OrbMatchInfo | null;
  best: OrbMatchInfo | null;
  runnerUp: OrbMatchInfo | null;
  correctIsBest: boolean;
  correctRank: number | null;
  totalCandidates: number;
  ranked: OrbMatchInfo[];
  /** Homography-verifier results over the same candidates. */
  verifyCorrect: OrbVerifyInfo | null;
  verifyBest: OrbVerifyInfo | null;
  verifyRunnerUp: OrbVerifyInfo | null;
  verifyCorrectIsBest: boolean;
  verifyCorrectRank: number | null;
  /** How many candidates produced any homography consensus at all. */
  verifySurvivors: number;
  elapsedMs: number;
  /** Verify-only wall time, so per-candidate cost can be read directly. */
  verifyMs: number;
};

export async function runOrbValidation(
  cases: ValidationCase[],
  refs: RefImage[],
): Promise<OrbCaseReport[]> {
  const reports: OrbCaseReport[] = [];
  for (const c of cases) {
    const started = performance.now();
    // Reuse the same rectify-or-fallback crop the block-hash pipeline hashes,
    // so this is an apples-to-apples comparison of scoring method only.
    const photo = await hashPhoto(c.photoUrl);
    const photoImg = await loadImageData(photo.previewUrl);

    const scores: OrbMatchInfo[] = [];
    const verifies: OrbVerifyInfo[] = [];
    let verifyMs = 0;
    for (const r of refs) {
      const refImg = await loadImageData(r.url);
      const score = await orbMatchScore(photoImg, refImg);
      scores.push({ label: r.label, goodMatches: score.goodMatches, avgDistance: score.avgDistance });
      const vStart = performance.now();
      const v = await orbVerifyScore(photoImg, refImg);
      verifyMs += performance.now() - vStart;
      verifies.push({
        label: r.label,
        inliers: v.rejected === "none" ? v.inliers : 0,
        good: v.good,
        rejected: v.rejected,
      });
    }
    scores.sort((a, b) => b.goodMatches - a.goodMatches);
    // Rank by geometry first, descriptor count second. A verified match always
    // outranks an unverified one, but when geometry fits nothing — a degenerate
    // homography on a poorly-rectified query, which is a real case here — this
    // degrades to the old descriptor ranking instead of discarding the answer.
    const goodByLabel = new Map(scores.map((s) => [s.label, s.goodMatches]));
    verifies.sort(
      (a, b) => b.inliers - a.inliers || (goodByLabel.get(b.label) ?? 0) - (goodByLabel.get(a.label) ?? 0),
    );

    const best = scores[0] ?? null;
    const runnerUp = scores[1] ?? null;
    const correctIndex = scores.findIndex((s) => s.label === c.correctRefLabel);
    const correct = correctIndex >= 0 ? scores[correctIndex] : null;

    const vCorrectIndex = verifies.findIndex((s) => s.label === c.correctRefLabel);

    reports.push({
      label: c.label,
      correct,
      best,
      runnerUp,
      correctIsBest: best?.label === c.correctRefLabel,
      correctRank: correctIndex >= 0 ? correctIndex + 1 : null,
      totalCandidates: scores.length,
      ranked: scores,
      verifyCorrect: vCorrectIndex >= 0 ? verifies[vCorrectIndex] : null,
      verifyBest: verifies[0] ?? null,
      verifyRunnerUp: verifies[1] ?? null,
      verifyCorrectIsBest: verifies[0]?.label === c.correctRefLabel,
      verifyCorrectRank: vCorrectIndex >= 0 ? vCorrectIndex + 1 : null,
      verifySurvivors: verifies.filter((v) => v.rejected === "none").length,
      elapsedMs: performance.now() - started,
      verifyMs,
    });
  }
  return reports;
}
