import { altPreviewArtPath, isPreviewArtPath, previewArtPath, previewArtUrl } from "./previewArt";

const TCGPLAYER_PRODUCT_IMAGE =
  /^(https?:\/\/tcgplayer-cdn\.tcgplayer\.com\/product\/\d+)(?:_[^./]+)?(\.[a-z0-9]+)$/i;

export type CardImageSize = "thumb" | "large";

const SIZE_SUFFIX: Record<CardImageSize, string> = {
  // Some scans cap below 400px.
  thumb: "_400w",
  large: "_in_1000x1000",
};

// Clicking the same `_200w` file in the lightbox barely enlarges the art, hence the larger CDN variants.
export function cardImageUrl(src: string | undefined | null, size: CardImageSize): string {
  if (!src) return "";
  const trimmed = src.trim();
  const match = trimmed.match(TCGPLAYER_PRODUCT_IMAGE);
  if (!match) return trimmed;
  return `${match[1]}${SIZE_SUFFIX[size]}${match[2]}`;
}

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

export function localCardArtPath(defId: string): string {
  return `/cards/${defId.trim().toUpperCase()}.png`;
}

export function isLocalCardsUrl(src: string | undefined | null): boolean {
  return !!src && src.trim().startsWith("/cards/");
}

export function isTcgplayerCdnUrl(src: string | undefined | null): boolean {
  return !!src && TCGPLAYER_PRODUCT_IMAGE.test(src.trim());
}

export function artAfterError(failed: string, defId: string): string | null {
  if (isPreviewArtPath(failed)) return null;
  if (isTcgplayerCdnUrl(failed)) {
    return altPreviewArtPath(failed) ?? previewArtPath(defId) ?? localCardArtPath(defId);
  }
  if (isLocalCardsUrl(failed)) return previewArtPath(defId);
  return null;
}

// TCGplayer answers a missing image with a landscape "Image Coming Soon" and HTTP 200, so `onError` never fires.
export function isPlaceholderArt(src: string | undefined | null, naturalWidth: number, naturalHeight: number): boolean {
  return isTcgplayerCdnUrl(src) && naturalWidth > 0 && naturalWidth > naturalHeight;
}
