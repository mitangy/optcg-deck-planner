import manifest from "./previewArt.json";

/**
 * Unofficial preview images in `public/cards/preview/`, for new cards that
 * TCGPlayer has no art for yet. They are shown only after the real art fails to
 * load (see `artAfterError`), or as the primary when a card has no image URL at
 * all, so real art wins as soon as it is posted.
 *
 * `previewArt.json` (sorted card ids that have a file in that folder) is
 * maintained by `python3 scripts/sync_preview_art.py`: it adds previews for
 * cards without TCGPlayer art and prunes the ones that now have it.
 */
const PREVIEW_IDS = new Set<string>(manifest);

/** `/cards/preview/<ID>.webp` for a card with a preview image, else null. */
export function previewArtPath(defId: string): string | null {
  const id = defId.trim().toUpperCase();
  return PREVIEW_IDS.has(id) ? `/cards/preview/${id}.webp` : null;
}

/** True for a card's own preview path (`/cards/preview/...`). */
export function isPreviewArtPath(src: string | undefined | null): boolean {
  return !!src && src.trim().startsWith("/cards/preview/");
}
