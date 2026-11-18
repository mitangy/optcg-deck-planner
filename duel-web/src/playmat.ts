import {
  cosmeticBackend,
  coverCropEncoder,
  requestPersistentStorage,
  shrinkToDataUrl,
  useSlotUrl,
} from "./cosmetics/browser";
import { createImageSlot } from "./cosmetics/imageSlot";

export const PLAYMAT_ASPECT = 12 / 7;

export const playmatSlot = createImageSlot({
  key: "mine",
  backend: cosmeticBackend("playmat"),
  encode: coverCropEncoder(PLAYMAT_ASPECT, "image/jpeg"),
  ladder: [
    { maxWidth: 2400, quality: 0.88 },
    { maxWidth: 1600, quality: 0.8 },
    { maxWidth: 1000, quality: 0.72 },
  ],
  afterSave: requestPersistentStorage,
});

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

export function usePlaymatUrl(): string | null {
  return useSlotUrl(playmatSlot);
}
