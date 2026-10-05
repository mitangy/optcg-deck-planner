import { createContext } from "react";
import type { Seat } from "../decks/seatArtPrefs";

/**
 * The seat this device plays in the current match, for whoever opens a card.
 * `undefined` outside a match; `null` for spectators (they own no cards).
 */
export const MatchViewerSeatContext = createContext<Seat | null | undefined>(undefined);

/**
 * The seat whose art prefs an inspect sheet may change, or null when it can't.
 * Only a card's owner picks its alt art: in a match the viewer is always the
 * match seat, whatever seat the opener passed, so an opponent's card opened
 * from Recent plays, the preview or their trash never offers Artwork.
 */
export function artEditSeat(opts: {
  ownerSeat?: Seat;
  viewingSeat?: Seat;
  matchSeat?: Seat | null;
}): Seat | null {
  const viewer = opts.matchSeat !== undefined ? opts.matchSeat : opts.viewingSeat;
  if (viewer == null) return null;
  if (opts.ownerSeat != null && opts.ownerSeat !== viewer) return null;
  return viewer;
}
