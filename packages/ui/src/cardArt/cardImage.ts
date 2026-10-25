import { altPreviewArtPath, isPreviewArtPath, previewArtPath, previewArtUrl } from "./previewArt";

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
 * `_in_1000x1000`. Non-TCGplayer URLs (local `/cards/…`, etc.) are returned
 * unchanged.
 */
export function cardImageUrl(src: string | undefined | null, size: CardImageSize): string {
  if (!src) return "";
  const trimmed = src.trim();
  const match = trimmed.match(TCGPLAYER_PRODUCT_IMAGE);
  if (!match) return trimmed;
  return `${match[1]}${SIZE_SUFFIX[size]}${match[2]}`;
}

/**
 * Ordered image URLs to try for a card: the resized TCGPlayer URL, the original
 * catalog URL, then the preview art (new cards TCGPlayer has no picture for).
 * Duplicates are dropped; empty when there is nothing to show. `origin` is where
 * the preview files are hosted (the planner uses the duel app's).
 */
export function cardArtChain(
  src: string | undefined | null,
  cardId: string | undefined | null,
  size: CardImageSize,
  origin = "",
): string[] {
  const chain: string[] = [];
  const resized = cardImageUrl(src, size);
  if (resized) chain.push(resized);
  const original = src?.trim();
  if (original && !chain.includes(original)) chain.push(original);
  const preview = previewArtUrl(cardId, src, origin);
  if (preview) chain.push(preview);
  return chain;
}

/** Local mirror path used when CDN art fails or no product id is known. */
export function localCardArtPath(defId: string): string {
  return `/cards/${defId.trim().toUpperCase()}.png`;
}

export function isLocalCardsUrl(src: string | undefined | null): boolean {
  return !!src && src.trim().startsWith("/cards/");
}

export function isTcgplayerCdnUrl(src: string | undefined | null): boolean {
  return !!src && TCGPLAYER_PRODUCT_IMAGE.test(src.trim());
}

/**
 * The art to try after `failed` did not load. The card's preview image (new
 * cards TCGplayer has no art for yet) comes before the local mirror; a failed
 * preview, or any other URL, ends the chain (show the text fallback):
 * - TCGplayer CDN: the alt printing's own preview (by product id), else the card's preview, else the local `/cards/<ID>.png` mirror
 * - local `/cards/...` (not the preview): preview, else nothing
 */
export function artAfterError(failed: string, defId: string): string | null {
  if (isPreviewArtPath(failed)) return null;
  if (isTcgplayerCdnUrl(failed)) {
    return altPreviewArtPath(failed) ?? previewArtPath(defId) ?? localCardArtPath(defId);
  }
  if (isLocalCardsUrl(failed)) return previewArtPath(defId);
  return null;
}

/**
 * TCGplayer answers a missing product image with a landscape "Image Coming Soon"
 * picture and HTTP 200, so `onError` never fires. Real card art is portrait.
 */
export function isPlaceholderArt(src: string | undefined | null, naturalWidth: number, naturalHeight: number): boolean {
  return isTcgplayerCdnUrl(src) && naturalWidth > 0 && naturalWidth > naturalHeight;
}
