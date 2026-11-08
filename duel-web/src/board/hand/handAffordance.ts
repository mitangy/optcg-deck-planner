/** DON!! still missing to play a card of this cost (0 when it is affordable). */
export function donShortfall(cost: number, activeDon: number): number {
  return Math.max(0, cost - activeDon);
}

/** Why an effect stops you playing a hand card this turn (the engine's hand row `blocked`). */
export type HandBlock = "characters" | "events" | "from_hand";

/** Plain-language reason for a blocked hand card (tooltip, aria and the selected-card hint). */
export function blockedReason(blocked: HandBlock): string {
  switch (blocked) {
    case "characters":
      return "An effect stops you playing Character cards this turn.";
    case "events":
      return "An effect stops you playing Event cards this turn.";
    case "from_hand":
      return "An effect stops you playing cards from your hand this turn.";
  }
}

/** Tooltip / aria text for a blocked hand card: its cost and why it cannot be played. */
export function blockedTitle(cost: number, blocked: HandBlock): string {
  return `Cost ${cost}. ${blockedReason(blocked)}`;
}

/** Hand caption line: the cost, or just "Can't play" when an effect blocks the card (the cost moves to the tooltip). */
export function handCostCaption(cost: number, blocked?: HandBlock): string {
  return blocked ? "Can't play" : `Cost ${cost}`;
}

/** What to say about a hand card that costs more than the active DON!!, or null. A blocked card says why instead. */
export function needsDonHint(cost: number, activeDon: number, blocked?: HandBlock): string | null {
  if (blocked) return blockedReason(blocked);
  return donShortfall(cost, activeDon) > 0 ? `Needs ${cost} DON!! (you have ${activeDon})` : null;
}

/**
 * Whether a hand card is grayed out as out of reach: your main phase, no pick
 * open, no legal play for it, short on active DON!! or blocked by an effect, and the setting is on.
 */
export function handCardOutOfReach(c: {
  dimSetting: boolean;
  mainPhase: boolean;
  picking: boolean;
  playable: boolean;
  cost: number;
  activeDon: number;
  /** An effect stops you playing this card this turn. */
  blocked?: HandBlock;
}): boolean {
  if (!c.dimSetting) return false;
  return c.mainPhase && !c.picking && !c.playable && (!!c.blocked || donShortfall(c.cost, c.activeDon) > 0);
}
