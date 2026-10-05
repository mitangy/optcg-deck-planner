/** DON!! still missing to play a card of this cost (0 when it is affordable). */
export function donShortfall(cost: number, activeDon: number): number {
  return Math.max(0, cost - activeDon);
}

/** What to say about a hand card that costs more than the active DON!!, or null. */
export function needsDonHint(cost: number, activeDon: number): string | null {
  return donShortfall(cost, activeDon) > 0 ? `Needs ${cost} DON!! (you have ${activeDon})` : null;
}

/**
 * Whether a hand card is grayed out as out of reach: your main phase, no pick
 * open, no legal play for it, short on active DON!!, and the setting is on.
 */
export function handCardOutOfReach(c: {
  dimSetting: boolean;
  mainPhase: boolean;
  picking: boolean;
  playable: boolean;
  cost: number;
  activeDon: number;
}): boolean {
  if (!c.dimSetting) return false;
  return c.mainPhase && !c.picking && !c.playable && donShortfall(c.cost, c.activeDon) > 0;
}
