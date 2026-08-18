/** Measure hash-match accuracy against real photos before OCR is removed.
 *
 * Dev-only: compares a scanned photo's hash against a small set of reference
 * printing images entirely client-side, with no backend calls — the point is
 * to answer "does perceptual hashing actually survive a real photo" before
 * committing to it, using the same rectify/hash code the app will use.
 */

import { findCardQuad, rectifyToCanvas } from "../cardRectify";
import { computeHash, hammingDistance } from "../imageHash";

export type RefImage = { label: string; url: string; cardId: string };

export type ValidationCase = {
  label: string;
  photoUrl: string;
  /**
   * The card *number* that is the true answer, e.g. "OP11-070".
   *
   * Scored per card number rather than per printing on purpose: a number has
   * ~2.4 printings (6,637 printings over 2,745 numbers), the photo may be any
   * of them, and identifying the card is the scanner's actual job. Choosing
   * between printings of that number is a separate, narrower problem.
   */
  correctCardId: string;
};

type Hashed = { hash: string; rectified: boolean; previewUrl: string };

export type MatchInfo = {
  label: string;
  cardId: string;
  url: string;
  previewUrl: string;
  distance: number;
};

export type CaseReport = {
  label: string;
  photoUrl: string;
  photoPreviewUrl: string;
  rectified: boolean;
  correctDistance: number | null;
  correctRefUrl: string;
  correctRefPreviewUrl: string;
  best: MatchInfo | null;
  runnerUp: MatchInfo | null;
  correctIsBest: boolean;
  /** 1-indexed position of the correct printing among all candidates, sorted by distance. */
  correctRank: number | null;
  totalCandidates: number;
  /** Every candidate, closest first — for inspecting where the correct one actually landed. */
  ranked: MatchInfo[];
};

export async function loadImageData(url: string): Promise<ImageData> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`fetch ${url} failed: HTTP ${res.status}`);
  const blob = await res.blob();
  const bitmap = await createImageBitmap(blob);
  const canvas = document.createElement("canvas");
  canvas.width = bitmap.width;
  canvas.height = bitmap.height;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("2d context unavailable");
  ctx.drawImage(bitmap, 0, 0);
  return ctx.getImageData(0, 0, canvas.width, canvas.height);
}

function toDataUrl(data: ImageData): string {
  const canvas = document.createElement("canvas");
  canvas.width = data.width;
  canvas.height = data.height;
  const ctx = canvas.getContext("2d");
  if (!ctx) return "";
  ctx.putImageData(data, 0, 0);
  return canvas.toDataURL("image/png");
}

/**
 * Rectify to a canonical card crop if a quad is found, else hash the image
 * as-is. Used for BOTH real photos and reference product images — reference
 * photos turned out to carry inconsistent margins (0-5%, or no detectable
 * border at all), so hashing them raw was comparing a different crop
 * convention than the rectified-photo side. Running both through the same
 * pipeline is what makes the two hashes comparable at all. `previewUrl` is
 * exactly the pixels that got hashed, so a mismatch can be seen, not just
 * inferred from a distance number.
 */
async function hashRectifiedOrRaw(url: string): Promise<Hashed> {
  const data = await loadImageData(url);
  const quad = findCardQuad(data);
  if (quad) {
    const rect = rectifyToCanvas(data, quad);
    const ctx = rect?.getContext("2d");
    if (rect && ctx) {
      const rectData = ctx.getImageData(0, 0, rect.width, rect.height);
      return { hash: computeHash(rectData), rectified: true, previewUrl: rect.toDataURL("image/png") };
    }
  }
  return { hash: computeHash(data), rectified: false, previewUrl: toDataUrl(data) };
}

/** Hash a real photo: rectify to a canonical card if possible, else hash as-is. */
export async function hashPhoto(url: string): Promise<Hashed> {
  return hashRectifiedOrRaw(url);
}

/** Hash a reference printing image, through the same rectify-or-raw pipeline as a photo. */
export async function hashReference(url: string): Promise<Hashed> {
  return hashRectifiedOrRaw(url);
}

export async function runValidation(
  cases: ValidationCase[],
  refs: RefImage[],
): Promise<CaseReport[]> {
  const refHashed = await Promise.all(
    refs.map(async (r) => ({
      label: r.label,
      cardId: r.cardId,
      url: r.url,
      ...(await hashReference(r.url)),
    })),
  );

  const reports: CaseReport[] = [];
  for (const c of cases) {
    const photo = await hashPhoto(c.photoUrl);
    const distances: MatchInfo[] = refHashed
      .map((r) => ({
        label: r.label,
        cardId: r.cardId,
        url: r.url,
        previewUrl: r.previewUrl,
        distance: hammingDistance(photo.hash, r.hash),
      }))
      .sort((a, b) => a.distance - b.distance);
    const best = distances[0] ?? null;
    const runnerUp = distances[1] ?? null;
    // Best-ranked printing *of the right card* — any of them counts.
    const correctIndex = distances.findIndex((d) => d.cardId === c.correctCardId);
    const correct = correctIndex >= 0 ? distances[correctIndex] : null;
    reports.push({
      label: c.label,
      photoUrl: c.photoUrl,
      photoPreviewUrl: photo.previewUrl,
      rectified: photo.rectified,
      correctDistance: correct ? correct.distance : null,
      correctRefUrl: correct?.url ?? "",
      correctRefPreviewUrl: correct?.previewUrl ?? "",
      best,
      runnerUp,
      correctIsBest: best?.cardId === c.correctCardId,
      correctRank: correctIndex >= 0 ? correctIndex + 1 : null,
      totalCandidates: distances.length,
      ranked: distances,
    });
  }
  return reports;
}
