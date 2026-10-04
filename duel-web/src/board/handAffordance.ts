/** DON!! still missing to play a card of this cost (0 when it is affordable). */
export function donShortfall(cost: number, activeDon: number): number {
  return Math.max(0, cost - activeDon);
}

/** What to say about a hand card that costs more than the active DON!!, or null. */
export function needsDonHint(cost: number, activeDon: number): string | null {
  return donShortfall(cost, activeDon) > 0 ? `Needs ${cost} DON!! (you have ${activeDon})` : null;
}
