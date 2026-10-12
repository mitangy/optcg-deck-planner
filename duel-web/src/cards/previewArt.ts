/**
 * TEMPORARY: unofficial EB05 preview images in `public/cards/preview/`, shown
 * only after the TCGPlayer image fails (see `artAfterError`), so real art wins
 * as soon as TCGPlayer posts it. Once TCGPlayer/Bandai publish EB05 art, delete
 * `public/cards/preview/`, this file and its use in `cardImage.ts`.
 */
const PREVIEW_PREFIX = "EB05-";
const PREVIEW_FIRST = 1;
const PREVIEW_LAST = 61;

/** `/cards/preview/<ID>.webp` for a card with a preview image, else null. */
export function previewArtPath(defId: string): string | null {
  const id = defId.trim().toUpperCase();
  if (!id.startsWith(PREVIEW_PREFIX)) return null;
  const rest = id.slice(PREVIEW_PREFIX.length);
  if (!/^\d{3}$/.test(rest)) return null;
  const n = Number(rest);
  return n >= PREVIEW_FIRST && n <= PREVIEW_LAST ? `/cards/preview/${id}.webp` : null;
}
