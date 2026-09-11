import { lookupCard } from "../cards/atlas";
import {
  getSeatArtPref,
  isSeatArtPrefsLive,
  type Seat,
} from "./seatArtPrefs";
import { getArtPrefs, getSelectedDeck } from "./storage";

export type ResolveCardImageOpts = {
  /** Prefer this seat's live cosmetics map for cards owned by that seat. */
  ownerSeat?: Seat;
};

/**
 * Resolve display art for a card.
 * With `ownerSeat`: live seat prefs first; if that seat is not live yet, fall
 * back to selected-deck then global. Once a seat is live, missing keys mean
 * standard atlas art (so opponent cosmetics do not inherit local deck prefs).
 * Without `ownerSeat`: selected-deck then global.
 */
export function resolveCardImageUrl(
  defId: string,
  opts?: ResolveCardImageOpts,
): string | undefined {
  const entry = lookupCard(defId);
  const ownerSeat = opts?.ownerSeat;
  let altId: string | undefined;

  if (ownerSeat === 0 || ownerSeat === 1) {
    const fromSeat = getSeatArtPref(ownerSeat, defId);
    if (fromSeat !== undefined) {
      altId = fromSeat;
    } else if (!isSeatArtPrefsLive(ownerSeat)) {
      altId = getSelectedDeck()?.artPrefs?.[defId] ?? getArtPrefs()[defId];
    }
  } else {
    altId = getSelectedDeck()?.artPrefs?.[defId] ?? getArtPrefs()[defId];
  }

  if (altId && entry.altArts?.length) {
    const hit = entry.altArts.find((a) => a.id === altId);
    if (hit?.imageUrl) return hit.imageUrl;
  }
  return entry.imageUrl;
}
