/** TCGplayer CDN size rewrite — mirrors frontend/src/cardImage.ts for duel-web. */
import { previewArtPath } from "./previewArt";

const TCGPLAYER_PRODUCT_IMAGE =
  /^(https?:\/\/tcgplayer-cdn\.tcgplayer\.com\/product\/\d+)(?:_[^./]+)?(\.[a-z0-9]+)$/i;

export type CardImageSize = "thumb" | "large";

const SIZE_SUFFIX: Record<CardImageSize, string> = {
  thumb: "_400w",
  large: "_in_1000x1000",
};

/**
 * Rewrite a catalog/atlas image URL to a TCGplayer CDN size.
 * Non-TCGplayer URLs (local `/cards/…`, etc.) are returned unchanged.
 */
export function cardImageUrl(
  src: string | undefined | null,
  size: CardImageSize,
): string {
  if (!src) return "";
  const trimmed = src.trim();
  const match = trimmed.match(TCGPLAYER_PRODUCT_IMAGE);
  if (!match) return trimmed;
  return `${match[1]}${SIZE_SUFFIX[size]}${match[2]}`;
}

/** Local mirror path used when CDN art fails or no product id is known. */
export function localCardArtPath(defId: string): string {
  return `/cards/${defId.trim().toUpperCase()}.png`;
}

export function isTcgplayerCdnUrl(src: string | undefined | null): boolean {
  return !!src && TCGPLAYER_PRODUCT_IMAGE.test(src.trim());
}

/**
 * The art to try after `failed` did not load: when the TCGplayer CDN fails, the
 * card's preview image if it has one (EB05, until the real art is out), else
 * the local mirror; then nothing (show the text fallback).
 */
export function artAfterError(failed: string, defId: string): string | null {
  if (!isTcgplayerCdnUrl(failed)) return null;
  return previewArtPath(defId) ?? localCardArtPath(defId);
}

/**
 * TCGplayer answers a missing product image with a landscape "Image Coming Soon"
 * picture and HTTP 200, so `onError` never fires. Real card art is portrait.
 */
export function isPlaceholderArt(src: string | undefined | null, naturalWidth: number, naturalHeight: number): boolean {
  return isTcgplayerCdnUrl(src) && naturalWidth > 0 && naturalWidth > naturalHeight;
}
