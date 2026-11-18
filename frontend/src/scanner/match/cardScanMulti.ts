
import type { Quad } from "../geometry/cardRectify";
import { quadArea, rectifyToImageData, RECTIFIED_HEIGHT, RECTIFIED_WIDTH } from "../geometry/cardRectify";
import { detectCardsAsync, intersectionArea, isCardShaped, type DetectOptions } from "../detect/cardDetect";
import { getCv } from "./cardMatch";
import { CONFIDENT_INLIERS, SURE_LEAD, matchRectified, type ScanCandidate, type ScanMatch } from "./cardScanMatch";
import { scanLog } from "../runtime/scanLog";

export type MultiScanConfidence = "sure" | "check" | "none";

export type MultiScanItem = {
  quad: Quad;
  thumbUrl: string;
  sampleUrl: string;
  cardId: string | null;
  inliers: number;
  runnerUp: number;
  confidence: MultiScanConfidence;
  embedRank?: number;
};

export type MultiScanProgress = {
  index: number;
  total: number;
};

export type MatchAllCards = (
  photo: ImageData,
  candidates: ScanCandidate[],
  onProgress?: (p: MultiScanProgress) => void,
) => Promise<MultiScanItem[]>;

const SURE_MARGIN = SURE_LEAD;

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

function cropUrl(photo: ImageData, quad: Quad, width: number, height: number, quality: number): string {
  if (typeof document === "undefined") return "";
  const crop = rectifyToImageData(photo, quad, width, height);
  if (!crop) return "";
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) return "";
  ctx.putImageData(new ImageData(crop.data, width, height), 0, 0);
  return canvas.toDataURL("image/jpeg", quality);
}

const thumbnailUrl = (photo: ImageData, quad: Quad) => cropUrl(photo, quad, THUMB_WIDTH, THUMB_HEIGHT, 0.8);

export const SAMPLE_WIDTH = 200;
export const SAMPLE_HEIGHT = 280;

const sampleUrl = (photo: ImageData, quad: Quad) => cropUrl(photo, quad, SAMPLE_WIDTH, SAMPLE_HEIGHT, 0.85);

export type MultiScanHooks = {
  thumbnail?: (photo: ImageData, quad: Quad) => string;
  sample?: (photo: ImageData, quad: Quad) => string;
  detect?: DetectOptions;
};

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
  const sample = hooks.sample ?? sampleUrl;

  const identify = async (quad: Quad): Promise<MultiScanItem> => {
    const pixels = rectifyToImageData(photo, quad);
    const match = pixels ? await matchRectified(pixels, candidates) : null;
    return {
      quad,
      thumbUrl: thumbnail(photo, quad),
      sampleUrl: sample(photo, quad),
      cardId: match?.cardId ?? null,
      inliers: match?.inliers ?? 0,
      runnerUp: match?.runnerUp ?? 0,
      embedRank: match?.embedRank,
      confidence: classifyMatch(match),
    };
  };

  const items: MultiScanItem[] = [];
  let block: { whole: Quad; items: MultiScanItem[] } | null = null;
  const settleBlock = async () => {
    if (!block) return;
    const { whole, items: cells } = block;
    block = null;
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
