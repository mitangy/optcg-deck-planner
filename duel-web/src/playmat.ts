/**
 * Custom playmat art. Uploaded images are cover-cropped to the official OPTCG
 * playmat ratio (24" × 14" → 12:7) and stored as a JPEG Blob in IndexedDB —
 * localStorage is too small for multi-megabyte art (it is only a fallback when
 * IndexedDB is unavailable). Signed-in players also keep it, and every earlier
 * upload, on their account (account/cosmeticsSync.ts).
 */
import {
  cosmeticBackend,
  coverCropEncoder,
  requestPersistentStorage,
  shrinkToDataUrl,
  useSlotUrl,
} from "./cosmetics/browser";
import { createImageSlot } from "./cosmetics/imageSlot";

/** Official playmat aspect ratio (width / height). */
export const PLAYMAT_ASPECT = 12 / 7;

export const playmatSlot = createImageSlot({
  key: "mine",
  backend: cosmeticBackend("playmat"),
  encode: coverCropEncoder(PLAYMAT_ASPECT, "image/jpeg"),
  // 2400×1400 keeps printed-mat art crisp on 4K boards; smaller rungs are used
  // when the browser's storage quota is tight.
  ladder: [
    { maxWidth: 2400, quality: 0.88 },
    { maxWidth: 1600, quality: 0.8 },
    { maxWidth: 1000, quality: 0.72 },
  ],
  afterSave: requestPersistentStorage,
});

/**
 * Small JPEG data URL of the playmat for the opponent (null when none set).
 * Sized to the server's relay cap, not the crisp local copy.
 */
export async function playmatShareUrl(maxChars: number): Promise<string | null> {
  const url = await playmatSlot.load();
  if (!url) return null;
  return shrinkToDataUrl(
    url,
    PLAYMAT_ASPECT,
    "image/jpeg",
    [
      { maxWidth: 1000, quality: 0.72 },
      { maxWidth: 720, quality: 0.65 },
      { maxWidth: 480, quality: 0.6 },
    ],
    maxChars,
  ).catch(() => null);
}

/** Object URL of the uploaded playmat, or null when none is set. */
export function usePlaymatUrl(): string | null {
  return useSlotUrl(playmatSlot);
}
