import manifest from "./previewArt.json";
import altManifest from "./previewArtAlts.json";

/**
 * Unofficial preview images in duel-web's `public/cards/preview/`, for new cards
 * that TCGPlayer has no art for yet. They are shown only after the real art
 * fails to load (see `artAfterError`), or as the primary when a card has no
 * image URL at all, so real art wins as soon as it is posted.
 *
 * `previewArt.json` (sorted card ids that have a file in that folder) and
 * `previewArtAlts.json` (TCGPlayer product ids of alternate-art printings, whose
 * file is `p<productId>.webp`) are maintained by `python3 scripts/sync_preview_art.py`:
 * it adds previews for cards without TCGPlayer art and prunes the ones that now
 * have it.
 *
 * Paths are relative (`/cards/preview/...`) unless an `origin` is given: the
 * planner passes the duel app's origin because duel-web hosts the files.
 */
const PREVIEW_IDS = new Set<string>(manifest);
const ALT_PREVIEW_PRODUCT_IDS = new Set<number>(altManifest);

const PRODUCT_ID_IN_CDN_URL = /product\/(\d+)_/;

/** `<origin>/cards/preview/<ID>.webp` for a card with a preview image, else null. */
export function previewArtPath(defId: string, origin = ""): string | null {
  const id = defId.trim().toUpperCase();
  return PREVIEW_IDS.has(id) ? `${origin}/cards/preview/${id}.webp` : null;
}

/** True for a card's own preview path (`/cards/preview/...`, relative paths only). */
export function isPreviewArtPath(src: string | undefined | null): boolean {
  return !!src && src.trim().startsWith("/cards/preview/");
}

/** Preview path for the alt printing a TCGPlayer CDN url points at, else null. */
export function altPreviewArtPath(cdnUrl: string, origin = ""): string | null {
  const m = cdnUrl.match(PRODUCT_ID_IN_CDN_URL);
  const pid = m ? Number(m[1]) : NaN;
  return ALT_PREVIEW_PRODUCT_IDS.has(pid) ? `${origin}/cards/preview/p${pid}.webp` : null;
}

/**
 * Preview url for a card: the alt-printing preview when the image URL's TCGPlayer
 * product id has one, else the card-id preview, else null.
 */
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
