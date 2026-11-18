import {
  cosmeticBackend,
  coverCropEncoder,
  requestPersistentStorage,
  shrinkToDataUrl,
  useSlotUrl,
} from "./cosmetics/browser";
import { createImageSlot } from "./cosmetics/imageSlot";

export const OFFICIAL_CARD_BACK = "/cards/card-back.webp";
export const OFFICIAL_DON_BACK = "/cards/don-back.webp";

export const CARD_BACK_ASPECT = 63 / 88;

export const cardBackSlot = createImageSlot({
  key: "mine",
  backend: cosmeticBackend("cardBack"),
  // WebP keeps transparent corners; browsers without WebP encode fall back to PNG.
  encode: coverCropEncoder(CARD_BACK_ASPECT, "image/webp"),
  ladder: [
    { maxWidth: 630, quality: 0.9 },
    { maxWidth: 400, quality: 0.8 },
    { maxWidth: 252, quality: 0.72 },
  ],
  afterSave: requestPersistentStorage,
});

export async function cardBackShareUrl(maxChars: number): Promise<string | null> {
  const url = await cardBackSlot.load();
  if (!url) return null;
  return shrinkToDataUrl(
    url,
    CARD_BACK_ASPECT,
    "image/webp",
    [
      { maxWidth: 300, quality: 0.8 },
      { maxWidth: 200, quality: 0.7 },
      { maxWidth: 140, quality: 0.6 },
    ],
    maxChars,
  ).catch(() => null);
}

export function useCardBackUrl(): string | null {
  return useSlotUrl(cardBackSlot);
}

export function cardBackCssValue(customUrl: string | null | undefined): string {
  return `url("${customUrl || OFFICIAL_CARD_BACK}")`;
}
