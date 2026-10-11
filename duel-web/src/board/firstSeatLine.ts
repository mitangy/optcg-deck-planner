import type { Seat } from "../net/protocol";

/**
 * The mulligan banner's opening line: who goes first and how that was decided (#549).
 * `pickedBy`: null = coin flip (a room's first game), a seat = the rematch loser who chose,
 * undefined = an older server that does not say.
 * `opponentName`: how to name the other seat when it chose (hotseat passes the seat's own name).
 */
export function firstSeatLine(o: {
  youFirst: boolean;
  boardSeat: Seat;
  pickedBy: Seat | null | undefined;
  opponentName?: string;
}): string {
  const order = o.youFirst ? "first" : "second";
  if (o.pickedBy === undefined) return `You go ${order}.`;
  if (o.pickedBy === null) return `Coin flip: you go ${order}.`;
  if (o.pickedBy === o.boardSeat) return `You chose to go ${order}.`;
  return `${o.opponentName ?? "Opponent"} chose: you go ${order}.`;
}
