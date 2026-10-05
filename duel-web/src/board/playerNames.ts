import type { Seat, SeatPlayers } from "../net/protocol";

/** Seats are numbered from 0 in the engine; people see Player 1 and Player 2. */
export function playerLabel(seat: number): string {
  return `Player ${seat + 1}`;
}

/** Display name for a seat, or null when the server didn't send one. */
export function seatName(players: SeatPlayers | null | undefined, seat: Seat): string | null {
  return players?.[seat]?.name ?? null;
}

/** Nameplate text for a seat, falling back to "Player N". */
export function seatLabel(players: SeatPlayers | null | undefined, seat: Seat): string {
  return seatName(players, seat) ?? playerLabel(seat);
}

/** Match-over headline: personal for players, named for spectators. */
export function winnerHeadline(
  players: SeatPlayers | null | undefined,
  winner: Seat,
  mySeat: Seat | null,
  spectating: boolean,
): string {
  if (!spectating && mySeat != null) {
    if (winner === mySeat) return "You win!";
    const opp = seatName(players, winner);
    return opp ? `${opp} wins` : "You lose";
  }
  return `${seatLabel(players, winner)} wins`;
}
