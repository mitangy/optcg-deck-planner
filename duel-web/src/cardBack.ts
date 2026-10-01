/**
 * Card backs for face-down cards (deck, life, hidden hands).
 *
 * The official Bandai backs ship in /public/cards. A custom main-deck back can
 * be uploaded on the Settings page; it is cover-cropped to the 63 × 88 mm card
 * ratio and stored in IndexedDB (and on the account, when signed in) like the
 * custom playmat. Only your own side of the board shows it — opponents always
 * see the official back.
 */
import {
  cosmeticBackend,
  coverCropEncoder,
  requestPersistentStorage,
  shrinkToDataUrl,
  useSlotUrl,
} from "./cosmetics/browser";
import { createImageSlot } from "./cosmetics/imageSlot";

/** Official main-deck card back (navy, gold compass). */
export const OFFICIAL_CARD_BACK = "/cards/card-back.webp";
/** Official DON!! card back (white, green compass). */
export const OFFICIAL_DON_BACK = "/cards/don-back.webp";

/** Standard card ratio (width / height): 63 × 88 mm. */
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

/** Small WebP data URL of the card back for the opponent (null when none set). */
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

/** Object URL of the uploaded card back, or null when using the official one. */
export function useCardBackUrl(): string | null {
  return useSlotUrl(cardBackSlot);
}

/**
 * CSS `background-image` value for `--card-back-art`. The styled gradient in
 * CSS sits underneath, so a failed image load still shows a back.
 */
export function cardBackCssValue(customUrl: string | null | undefined): string {
  return `url("${customUrl || OFFICIAL_CARD_BACK}")`;
}
