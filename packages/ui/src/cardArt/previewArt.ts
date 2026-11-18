import manifest from "./previewArt.json";
import altManifest from "./previewArtAlts.json";

// Shown only after the real art fails to load, so real art wins as soon as it is posted.
const PREVIEW_IDS = new Set<string>(manifest);
const ALT_PREVIEW_PRODUCT_IDS = new Set<number>(altManifest);

const PRODUCT_ID_IN_CDN_URL = /product\/(\d+)_/;

export function previewArtPath(defId: string, origin = ""): string | null {
  const id = defId.trim().toUpperCase();
  return PREVIEW_IDS.has(id) ? `${origin}/cards/preview/${id}.webp` : null;
}

export function isPreviewArtPath(src: string | undefined | null): boolean {
  return !!src && src.trim().startsWith("/cards/preview/");
}

export function altPreviewArtPath(cdnUrl: string, origin = ""): string | null {
  const m = cdnUrl.match(PRODUCT_ID_IN_CDN_URL);
  const pid = m ? Number(m[1]) : NaN;
  return ALT_PREVIEW_PRODUCT_IDS.has(pid) ? `${origin}/cards/preview/p${pid}.webp` : null;
}

export function previewArtUrl(
  cardId: string | null | undefined,
  imageUrl?: string | null,
  origin = "",
): string | null {
  return (
    (imageUrl ? altPreviewArtPath(imageUrl, origin) : null) ??
    previewArtPath(cardId ?? "", origin)
  );
}
