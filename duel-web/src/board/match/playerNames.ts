import type { Seat, SeatPlayers } from "../../net/protocol";

export function playerLabel(seat: number): string {
  return `Player ${seat + 1}`;
}

export function seatName(players: SeatPlayers | null | undefined, seat: Seat): string | null {
  return players?.[seat]?.name ?? null;
}

export function seatLabel(players: SeatPlayers | null | undefined, seat: Seat): string {
  return seatName(players, seat) ?? playerLabel(seat);
}

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
