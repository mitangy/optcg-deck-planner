export function donShortfall(cost: number, activeDon: number): number {
  return Math.max(0, cost - activeDon);
}

export type HandBlock = "characters" | "events" | "from_hand";

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

export function blockedTitle(cost: number, blocked: HandBlock): string {
  return `Cost ${cost}. ${blockedReason(blocked)}`;
}

export function handCostCaption(cost: number, blocked?: HandBlock): string {
  return blocked ? "Can't play" : `Cost ${cost}`;
}

export function needsDonHint(cost: number, activeDon: number, blocked?: HandBlock): string | null {
  if (blocked) return blockedReason(blocked);
  return donShortfall(cost, activeDon) > 0 ? `Needs ${cost} DON!! (you have ${activeDon})` : null;
}

export function handCardOutOfReach(c: {
  dimSetting: boolean;
  mainPhase: boolean;
  picking: boolean;
  playable: boolean;
  cost: number;
  activeDon: number;
  blocked?: HandBlock;
}): boolean {
  if (!c.dimSetting) return false;
  return c.mainPhase && !c.picking && !c.playable && (!!c.blocked || donShortfall(c.cost, c.activeDon) > 0);
}
