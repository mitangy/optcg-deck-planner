/** Run the production scan pipeline over fixture photos and report per-case
 * results, so a change to matching can be judged against real photos rather
 * than assumed.
 *
 * Uses the same modules the app uses — no parallel implementation — so a
 * regression here is a regression in the shipped path.
 */

import { loadCandidates, matchCard, releaseCandidates, type ScanCandidate } from "../cardScanMatch";
import { ensureDescriptors, type DescriptorManifest } from "../descriptorCache";

export type ScanCase = {
  label: string;
  photoUrl: string;
  /** Card number the photo actually shows. */
  expect: string;
};

export type ScanCaseResult = {
  label: string;
  expect: string;
  got: string | null;
  correct: boolean;
  inliers: number;
  runnerUp: number;
  examined: number;
  ms: number;
};

async function loadImageData(url: string): Promise<ImageData> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`fetch ${url}: HTTP ${res.status}`);
  const bitmap = await createImageBitmap(await res.blob());
  const canvas = document.createElement("canvas");
  canvas.width = bitmap.width;
  canvas.height = bitmap.height;
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) throw new Error("2d context unavailable");
  ctx.drawImage(bitmap, 0, 0);
  return ctx.getImageData(0, 0, canvas.width, canvas.height);
}

export async function runScanValidation(
  cases: ScanCase[],
  manifestUrl: string,
  baseUrl: string,
  onProgress?: (msg: string) => void,
): Promise<{ results: ScanCaseResult[]; candidateCount: number }> {
  onProgress?.("loading manifest");
  const manifest: DescriptorManifest = await (await fetch(manifestUrl)).json();
  onProgress?.("ensuring descriptors cached");
  await ensureDescriptors(manifest, baseUrl, (p) =>
    onProgress?.(`chunk ${p.chunksDone}/${p.chunksTotal}`),
  );
  onProgress?.("building candidates");
  const candidates: ScanCandidate[] = await loadCandidates(manifest);

  const results: ScanCaseResult[] = [];
  try {
    for (const c of cases) {
      onProgress?.(c.label);
      const photo = await loadImageData(c.photoUrl);
      const started = performance.now();
      const match = await matchCard(photo, candidates);
      results.push({
        label: c.label,
        expect: c.expect,
        got: match?.cardId ?? null,
        correct: match?.cardId === c.expect,
        inliers: match?.inliers ?? 0,
        runnerUp: match?.runnerUp ?? 0,
        examined: match?.examined ?? candidates.length,
        ms: Math.round(performance.now() - started),
      });
    }
  } finally {
    await releaseCandidates(candidates);
  }
  return { results, candidateCount: candidates.length };
}
