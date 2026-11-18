import { createContext } from "react";
import type { Seat } from "../../decks/seatArtPrefs";

export const MatchViewerSeatContext = createContext<Seat | null | undefined>(undefined);

// In a match the viewer is always the match seat, whatever seat the opener passed.
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
