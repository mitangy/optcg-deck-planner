/**
 * Custom playmat art. Uploaded images are cover-cropped to the official OPTCG
 * playmat ratio (24" × 14" → 12:7) and stored as a JPEG Blob in IndexedDB —
 * localStorage is too small for multi-megabyte art (it is only a fallback when
 * IndexedDB is unavailable). Survives reloads and new sessions in this browser.
 */
import {
  cosmeticBackend,
  coverCropEncoder,
  requestPersistentStorage,
  useSlotUrl,
} from "./cosmetics/browser";
import { createImageSlot } from "./cosmetics/imageSlot";

/** Official playmat aspect ratio (width / height). */
export const PLAYMAT_ASPECT = 12 / 7;

const playmatSlot = createImageSlot({
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

export function savePlaymat(file: File): Promise<void> {
  return playmatSlot.save(file);
}

export function clearPlaymat(): Promise<void> {
  return playmatSlot.clear();
}

/** Object URL of the uploaded playmat, or null when none is set. */
export function usePlaymatUrl(): string | null {
  return useSlotUrl(playmatSlot);
}
