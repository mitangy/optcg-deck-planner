import manifest from "../../duel-web/src/cards/previewArt.json";
import altManifest from "../../duel-web/src/cards/previewArtAlts.json";
import { DUEL_URL } from "./duelLink";

/**
 * Unofficial preview art the duel app hosts for cards TCGPlayer has no picture
 * for yet (new sets). The manifests are the duel app's own, maintained by
 * `scripts/sync_preview_art.py`. The planner shows a preview only after the
 * real art fails to load (or when a card has no image URL), so real art wins
 * as soon as TCGPlayer posts it.
 */
const PREVIEW_IDS = new Set<string>(manifest);
const ALT_PREVIEW_PRODUCT_IDS = new Set<number>(altManifest);

const PRODUCT_ID_IN_CDN_URL = /product\/(\d+)_/;

/**
 * Preview URL for a card: the alt-printing preview when the image URL's TCGPlayer
 * product id has one, else the card-id preview, else null.
 */
export function previewArtUrl(
  cardId: string | null | undefined,
  imageUrl?: string | null,
): string | null {
  const m = imageUrl?.match(PRODUCT_ID_IN_CDN_URL);
  const pid = m ? Number(m[1]) : NaN;
  if (ALT_PREVIEW_PRODUCT_IDS.has(pid)) return `${DUEL_URL}/cards/preview/p${pid}.webp`;
  const id = (cardId ?? "").trim().toUpperCase();
  return PREVIEW_IDS.has(id) ? `${DUEL_URL}/cards/preview/${id}.webp` : null;
}
