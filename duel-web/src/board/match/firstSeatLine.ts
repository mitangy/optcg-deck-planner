import type { DiceResult, Seat } from "../../net/protocol";

/**
 * The mulligan banner's opening line: who goes first and how that was decided (#549).
 * `pickedBy`: null = coin flip (a room's first game), a seat = the rematch loser who chose,
 * undefined = an older server that does not say.
 * `dice`: the opening dice roll that decided a room's first game (#1190); `pickedBy` is then the roll's winner.
 * `opponentName`: how to name the other seat when it chose (hotseat passes the seat's own name).
 */
export function firstSeatLine(o: {
  youFirst: boolean;
  boardSeat: Seat;
  pickedBy: Seat | null | undefined;
  dice?: DiceResult | null;
  opponentName?: string;
}): string {
  const order = o.youFirst ? "first" : "second";
  if (o.dice) {
    const roll = `${o.dice.roll}, ${o.dice.call === "high" ? "High" : "Low"}`;
    return o.dice.winner === o.boardSeat
      ? `You won the dice roll (${roll}) and chose to go ${order}.`
      : `${o.opponentName ?? "Opponent"} won the dice roll (${roll}): you go ${order}.`;
  }
  if (o.pickedBy === undefined) return `You go ${order}.`;
  if (o.pickedBy === null) return `Coin flip: you go ${order}.`;
  if (o.pickedBy === o.boardSeat) return `You chose to go ${order}.`;
  return `${o.opponentName ?? "Opponent"} chose: you go ${order}.`;
}
