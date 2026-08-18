/** Does the existing OCR pipeline read enough to narrow the search space?
 *
 * Not "does it get the exact card right" — that's the problem it already
 * has. The question here is whether even a partial/fuzzy read reliably
 * identifies the *set* (e.g. "OP06"), which would be enough to shrink an
 * ORB match from the whole catalog (thousands, too slow client-side) down to
 * one set's worth of printings (dozens, fast).
 */

import { recognizeCardText } from "../cardScanOcr";
import { extractCardIdTokens, repairCardId } from "../cardScan";

export type OcrValidationCase = {
  label: string;
  photoUrl: string;
  /** The true card id, e.g. "OP06-119". */
  correctCardId: string;
};

export type OcrCaseReport = {
  label: string;
  rawText: string;
  rawTokens: string[];
  repairedIds: string[];
  correctSet: string;
  gotCorrectSet: boolean;
  gotExactId: boolean;
};

async function fetchBlob(url: string): Promise<Blob> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`fetch ${url} failed: HTTP ${res.status}`);
  return res.blob();
}

/** "OP06-119" -> "OP06". Sets, not exact numbers, are what a shortlist needs. */
function setOf(cardId: string): string {
  return cardId.split("-")[0] ?? cardId;
}

export async function runOcrValidation(cases: OcrValidationCase[]): Promise<OcrCaseReport[]> {
  const reports: OcrCaseReport[] = [];
  for (const c of cases) {
    const blob = await fetchBlob(c.photoUrl);
    const rawText = await recognizeCardText(blob);
    const rawTokens = extractCardIdTokens(rawText);
    const repairedIds = rawTokens.map((t) => repairCardId(t)).filter((id): id is string => id !== null);
    const correctSet = setOf(c.correctCardId);
    reports.push({
      label: c.label,
      rawText,
      rawTokens,
      repairedIds,
      correctSet,
      gotCorrectSet: repairedIds.some((id) => setOf(id) === correctSet),
      gotExactId: repairedIds.includes(c.correctCardId),
    });
  }
  return reports;
}
