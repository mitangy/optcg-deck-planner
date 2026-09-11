import { lookupCard } from "../cards/atlas";
import { cardImageUrl, type CardImageSize } from "../cards/cardImage";
import { getArtPrefs, getSelectedDeck, type SavedDeck } from "./storage";

export type ResolveCardImageOpts = {
  /**
   * Explicit deck for artPrefs.
   * - `undefined` (default): use the selected deck
   * - `null` or a deck with no prefs: skip deck prefs / use only global
   */
  deck?: SavedDeck | null;
  size?: CardImageSize;
};

function isSavedDeck(v: unknown): v is SavedDeck {
  return (
    !!v &&
    typeof v === "object" &&
    "leaderId" in v &&
    "cards" in v &&
    typeof (v as SavedDeck).leaderId === "string" &&
    Array.isArray((v as SavedDeck).cards)
  );
}

function rawCardImageUrl(
  defId: string,
  deck?: SavedDeck | null,
): string | undefined {
  const entry = lookupCard(defId);
  const resolved = deck === undefined ? getSelectedDeck() : deck;
  const altId = resolved?.artPrefs?.[defId] ?? getArtPrefs()[defId];
  if (altId && entry.altArts?.length) {
    const hit = entry.altArts.find((a) => a.id === altId);
    if (hit?.imageUrl) return hit.imageUrl;
  }
  return entry.imageUrl;
}

/**
 * Resolve display art for a card.
 * Prefers deck artPrefs → global prefs → atlas default, then applies CDN size rewrite.
 *
 * Call shapes (for gradual migration across stacked PRs):
 * - `resolveCardImageUrl(id)` / `resolveCardImageUrl(id, "thumb"|"large")`
 * - `resolveCardImageUrl(id, savedDeck)`
 * - `resolveCardImageUrl(id, { deck?, size? })`
 */
export function resolveCardImageUrl(
  defId: string,
  opts?: ResolveCardImageOpts | CardImageSize | SavedDeck | null,
): string | undefined {
  let deck: SavedDeck | null | undefined = undefined;
  let size: CardImageSize = "thumb";

  if (opts === null) {
    deck = null;
  } else if (opts === "thumb" || opts === "large") {
    size = opts;
  } else if (isSavedDeck(opts)) {
    deck = opts;
  } else if (opts && typeof opts === "object") {
    if ("deck" in opts) deck = opts.deck;
    if (opts.size) size = opts.size;
  }

  const raw = rawCardImageUrl(defId, deck);
  if (!raw) return undefined;
  return cardImageUrl(raw, size) || raw;
}
