import { lookupCard } from "../cards/atlas";
import { getArtPrefs, getSelectedDeck } from "./storage";

/** Resolve display art for a card, honoring global + selected-deck alt prefs. */
export function resolveCardImageUrl(defId: string): string | undefined {
  const entry = lookupCard(defId);
  const deck = getSelectedDeck();
  const altId = deck?.artPrefs?.[defId] ?? getArtPrefs()[defId];
  if (altId && entry.altArts?.length) {
    const hit = entry.altArts.find((a) => a.id === altId);
    if (hit?.imageUrl) return hit.imageUrl;
  }
  return entry.imageUrl;
}
