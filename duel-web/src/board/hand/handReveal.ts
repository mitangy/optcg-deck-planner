type HandCard = { id: string; defId: string; artCopy?: number };

export const HIDDEN_HAND_DEF = "HIDDEN";

const FAN_CAP = 10;

export function farHandWithReveals(handCount: number, revealed: readonly HandCard[] | undefined): HandCard[] | undefined {
  if (!revealed?.length) return undefined;
  const faces = revealed.slice(0, handCount);
  const total = Math.max(Math.min(handCount, FAN_CAP), faces.length);
  const hidden = Array.from({ length: total - faces.length }, (_, i): HandCard => ({ id: `hidden-${i}`, defId: HIDDEN_HAND_DEF }));
  return [...faces, ...hidden];
}

export function revealedIdSet(revealed: readonly HandCard[] | undefined): ReadonlySet<string> {
  return new Set((revealed ?? []).map((c) => c.id));
}
