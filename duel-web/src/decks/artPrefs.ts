import { lookupCard } from "../cards/atlas";
import { cardImageUrl, type CardImageSize } from "../cards/cardImage";
import { getArtPrefs, getSelectedDeck } from "./storage";

function rawCardImageUrl(defId: string): string | undefined {
  const entry = lookupCard(defId);
  const deck = getSelectedDeck();
  const altId = deck?.artPrefs?.[defId] ?? getArtPrefs()[defId];
  if (altId && entry.altArts?.length) {
    const hit = entry.altArts.find((a) => a.id === altId);
    if (hit?.imageUrl) return hit.imageUrl;
  }
  return entry.imageUrl;
}

/** Resolve display art for a card, honoring global + selected-deck alt prefs. */
export function resolveCardImageUrl(
  defId: string,
  size: CardImageSize = "thumb",
): string | undefined {
  const raw = rawCardImageUrl(defId);
  if (!raw) return undefined;
  return cardImageUrl(raw, size) || raw;
}
