export type ExtraStepInput = {
  owned: number;
  deckNeed: number;
  extraQty: number;
  stillNeed: number;
};

export function nextExtraTarget(input: ExtraStepInput, delta: 1 | -1): number {
  const { owned, deckNeed, stillNeed } = input;
  const listTarget = owned + stillNeed;
  if (delta > 0) return listTarget + 1;
  const next = listTarget - 1;
  if (next <= Math.max(owned, deckNeed)) return 0;
  return next;
}

/**
 * Copies owned across base and alt printings. The backend subtracts both from
 * need when it computes still_need, so the stepper must start from the same total.
 */
export function totalOwnedCopies(item: { owned: number; alts_owned?: number }): number {
  return item.owned + (item.alts_owned ?? 0);
}

export function nextWantTarget(input: { need: number; deckNeed: number }, delta: 1 | -1): number {
  const { need, deckNeed } = input;
  if (delta > 0) return need + 1;
  const next = need - 1;
  if (next <= deckNeed) return 0;
  return next;
}

export function wantAtDeckFloor(input: { need: number; deckNeed: number }): boolean {
  return input.deckNeed > 0 && input.need <= input.deckNeed;
}
