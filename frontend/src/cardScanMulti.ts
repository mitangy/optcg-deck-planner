/** Scan every card in one photo.
 *
 * detect card outlines -> rectify each -> identify each with the single-card
 * matcher (`matchCard`). Detection lives in `cardDetect.ts`.
 *
 * CONTRACT (shared by the detector and the review tray; keep these types stable).
 */

import type { Quad } from "./cardRectify";
import { quadArea, rectifyToImageData, RECTIFIED_HEIGHT, RECTIFIED_WIDTH } from "./cardRectify";
import { detectCardsAsync, intersectionArea, isCardShaped, type DetectOptions } from "./cardDetect";
import { getCv } from "./cardMatch";
import { CONFIDENT_INLIERS, SURE_LEAD, matchRectified, type ScanCandidate, type ScanMatch } from "./cardScanMatch";
import { scanLog } from "./scanLog";

export type MultiScanConfidence = "sure" | "check" | "none";

export type MultiScanItem = {
  /** Outline of this card in the source photo's pixel space (TL, TR, BR, BL). */
  quad: Quad;
  /** Small upright crop of the card for the review tray (JPEG/PNG data URL). */
  thumbUrl: string;
  /** Matched card number, e.g. "OP01-120", or null when nothing verified. */
  cardId: string | null;
  inliers: number;
  runnerUp: number;
  /** "sure": confident match; "check": weak or close call; "none": no match. */
  confidence: MultiScanConfidence;
  /** Rank of the matched card by art-embedding similarity, when an embedder ran (diagnostics). */
  embedRank?: number;
};

export type MultiScanProgress = {
  /** 0-based index of the card being identified, of `total` detected. */
  index: number;
  total: number;
};

/**
 * Detect and identify every card in `photo`. Implemented in this module by
 * the detector work; the tray only depends on this signature.
 */
export type MatchAllCards = (
  photo: ImageData,
  candidates: ScanCandidate[],
  onProgress?: (p: MultiScanProgress) => void,
) => Promise<MultiScanItem[]>;

/** A match needs a clear lead over the next-best card to be trusted unseen. */
const SURE_MARGIN = SURE_LEAD;

/**
 * With an embedder, "sure" also needs the art embedding to place the matched
 * card this high. ORB inliers alone are a geometric coincidence test; a wrong
 * card that scored 17-35 inliers (a reprint sharing an illustration, a
 * template-heavy card) was always far down the embedding's list, while every
 * correct read was in its top few. A card that fails this is "check", so the
 * tray never offers it as ready to add.
 */
export const SURE_EMBED_RANK = 10;

export function classifyMatch(
  match: Pick<ScanMatch, "inliers" | "runnerUp" | "embedRank"> | null,
): MultiScanConfidence {
  if (!match || match.inliers <= 0) return "none";
  const embedderAgrees = match.embedRank === undefined || match.embedRank < SURE_EMBED_RANK;
  if (match.inliers >= CONFIDENT_INLIERS && match.inliers - match.runnerUp >= SURE_MARGIN && embedderAgrees) {
    return "sure";
  }
  return "check";
}

/** Share of a card's own area that another detected card must cover for it to count as overlapped. */
export const COVERED_OVERLAP = 0.15;

/**
 * The detector also returns partly covered cards (a fan, an overlapping pair,
 * a card half behind another) with their full outline. What such a crop shows
 * is partly the card in front, and a printed box or a neighbour's art can read
 * as a real card, so an overlapped detection is only "sure" when it is the
 * best read (most inliers) among the detections it overlaps. Every other
 * overlapped one is at most "check".
 */
export function capOverlappedConfidence<T extends Pick<MultiScanItem, "quad" | "inliers" | "confidence">>(items: T[]): T[] {
  const areas = items.map((it) => quadArea(it.quad));
  return items.map((it, i) => {
    if (it.confidence !== "sure") return it;
    const beaten = items.some((other, j) => {
      if (j === i) return false;
      if (intersectionArea(it.quad, other.quad) / areas[i] < COVERED_OVERLAP) return false;
      return other.inliers > it.inliers || (other.inliers === it.inliers && j < i);
    });
    return beaten ? { ...it, confidence: "check" as const } : it;
  });
}

/** Share of an unnamed detection's own area that another detection must cover for it to be dropped. */
export const HIDDEN_UNNAMED_OVERLAP = 0.4;

/**
 * A covered card the matcher could not name is not worth a row in the tray
 * (its crop is mostly the card in front, and the row only offers a fix form).
 * Drop "none" detections that another detection mostly covers. Named ones stay
 * (capped to "check" by `capOverlappedConfidence`). Of two unnamed detections
 * that cover each other, one survives.
 */
export function dropHiddenUnnamed<T extends Pick<MultiScanItem, "quad" | "confidence">>(items: T[]): T[] {
  const areas = items.map((it) => quadArea(it.quad));
  const dropped = new Set<number>();
  items.forEach((it, i) => {
    if (it.confidence !== "none") return;
    const hidden = items.some(
      (other, j) =>
        j !== i && !dropped.has(j) && intersectionArea(it.quad, other.quad) / areas[i] >= HIDDEN_UNNAMED_OVERLAP,
    );
    if (hidden) dropped.add(i);
  });
  return items.filter((_, i) => !dropped.has(i));
}

const THUMB_HEIGHT = 160;
const THUMB_WIDTH = Math.round((THUMB_HEIGHT * RECTIFIED_WIDTH) / RECTIFIED_HEIGHT);

function thumbnailUrl(photo: ImageData, quad: Quad): string {
  const thumb = rectifyToImageData(photo, quad, THUMB_WIDTH, THUMB_HEIGHT);
  if (!thumb) return "";
  const canvas = document.createElement("canvas");
  canvas.width = THUMB_WIDTH;
  canvas.height = THUMB_HEIGHT;
  const ctx = canvas.getContext("2d");
  if (!ctx) return "";
  ctx.putImageData(new ImageData(thumb.data, THUMB_WIDTH, THUMB_HEIGHT), 0, 0);
  return canvas.toDataURL("image/jpeg", 0.8);
}

export type MultiScanHooks = {
  /** Replace the browser thumbnail (Node has no canvas). */
  thumbnail?: (photo: ImageData, quad: Quad) => string;
  detect?: DetectOptions;
};

/** `matchAllCards` with its browser-only pieces swappable, for the Node harness. */
export async function matchAllCardsWith(
  hooks: MultiScanHooks,
  photo: ImageData,
  candidates: ScanCandidate[],
  onProgress?: (p: MultiScanProgress) => void,
): Promise<MultiScanItem[]> {
  const cv = await getCv();
  const cards = await detectCardsAsync(cv, photo, hooks.detect);
  scanLog("scan:multi", `${cards.length} card outline(s)`);
  const thumbnail = hooks.thumbnail ?? thumbnailUrl;

  const identify = async (quad: Quad): Promise<MultiScanItem> => {
    // Rectify from the full-resolution photo, not the detection copy.
    const pixels = rectifyToImageData(photo, quad);
    const match = pixels ? await matchRectified(pixels, candidates) : null;
    return {
      quad,
      thumbUrl: thumbnail(photo, quad),
      cardId: match?.cardId ?? null,
      inliers: match?.inliers ?? 0,
      runnerUp: match?.runnerUp ?? 0,
      embedRank: match?.embedRank,
      confidence: classifyMatch(match),
    };
  };

  const items: MultiScanItem[] = [];
  // Cells cut from one block of touching cards, until the block is settled.
  let block: { whole: Quad; items: MultiScanItem[] } | null = null;
  const settleBlock = async () => {
    if (!block) return;
    const { whole, items: cells } = block;
    block = null;
    // Nothing matched in any cell: perhaps the "block" is one card with a
    // straight line through it. Try it whole and keep that if it identifies.
    if (isCardShaped(whole) && cells.every((c) => c.confidence === "none")) {
      const single = await identify(whole);
      if (single.confidence !== "none") {
        items.length -= cells.length;
        items.push(single);
      }
    }
  };

  for (let index = 0; index < cards.length; index += 1) {
    const { quad, whole } = cards[index];
    if (block && block.whole !== whole) await settleBlock();
    onProgress?.({ index, total: cards.length });
    // Let the UI repaint between cards; matching is synchronous-heavy.
    await new Promise((resolve) => setTimeout(resolve, 1));
    const item = await identify(quad);
    items.push(item);
    if (whole) {
      block ??= { whole, items: [] };
      block.items.push(item);
    }
  }
  await settleBlock();
  return dropHiddenUnnamed(capOverlappedConfidence(items));
}

export const matchAllCards: MatchAllCards = (photo, candidates, onProgress) =>
  matchAllCardsWith({}, photo, candidates, onProgress);
