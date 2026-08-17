/** TCGCSV stores TCGplayer `_200w` thumbs (~200×280). Larger CDN variants exist. */
const TCGPLAYER_PRODUCT_IMAGE =
  /^(https?:\/\/tcgplayer-cdn\.tcgplayer\.com\/product\/\d+)(?:_[^./]+)?(\.[a-z0-9]+)$/i;

export type CardImageSize = "thumb" | "large";

const SIZE_SUFFIX: Record<CardImageSize, string> = {
  // Sharp at list/grid CSS sizes (including 2× retina). Some scans cap below 400px.
  thumb: "_400w",
  // Fits the original into a 1000×1000 box. Typical OPTCG scans are ~600×838.
  large: "_in_1000x1000",
};

/**
 * Rewrite a catalog image URL to a TCGplayer CDN size.
 *
 * Catalog rows keep the `_200w` URL from TCGCSV. Clicking that same file in the
 * lightbox barely enlarges the art, so thumbs use `_400w` and the lightbox uses
 * `_in_1000x1000`. Non-TCGplayer URLs are returned unchanged.
 */
export function cardImageUrl(src: string | undefined | null, size: CardImageSize): string {
  if (!src) return "";
  const trimmed = src.trim();
  const match = trimmed.match(TCGPLAYER_PRODUCT_IMAGE);
  if (!match) return trimmed;
  return `${match[1]}${SIZE_SUFFIX[size]}${match[2]}`;
}
