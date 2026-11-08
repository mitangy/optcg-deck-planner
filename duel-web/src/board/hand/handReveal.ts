/** Hand cards an effect revealed (e.g. "reveal 2 Events from your hand") stay face up for the rest of the turn (#491). */
type HandCard = { id: string; defId: string };

/** Placeholder defId for an unrevealed card inside a far hand that is partly face up. Rendered as a card back. */
export const HIDDEN_HAND_DEF = "HIDDEN";

/** Same cap the opponent-hand fans use for card backs. */
const FAN_CAP = 10;

/**
 * The opponent's hand as the board shows it while some of it is revealed: the revealed cards first (reveal order),
 * then card-back placeholders for the rest. Capped like the all-backs fan, but never cuts a revealed card.
 * Returns undefined when nothing is revealed, so the usual backs render.
 */
export function farHandWithReveals(handCount: number, revealed: readonly HandCard[] | undefined): HandCard[] | undefined {
  if (!revealed?.length) return undefined;
  const faces = revealed.slice(0, handCount);
  const total = Math.max(Math.min(handCount, FAN_CAP), faces.length);
  const hidden = Array.from({ length: total - faces.length }, (_, i): HandCard => ({ id: `hidden-${i}`, defId: HIDDEN_HAND_DEF }));
  return [...faces, ...hidden];
}

/** Ids of this player's own hand cards that were revealed to the opponent. */
export function revealedIdSet(revealed: readonly HandCard[] | undefined): ReadonlySet<string> {
  return new Set((revealed ?? []).map((c) => c.id));
}
