import { lookupCard } from "../cards/atlas";
import { getArtPrefs, getSelectedDeck, type SavedDeck } from "./storage";

/**
 * Resolve display art for a card.
 * Prefers `deck.artPrefs`, then global prefs, then default atlas art.
 * Pass `deck` explicitly (configure page); otherwise uses the selected deck.
 * Seat-scoped resolution (Plan 1) can wrap this later without changing storage.
 */
export function resolveCardImageUrl(
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
