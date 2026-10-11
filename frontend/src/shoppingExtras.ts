/**
 * Cards added straight to Master Shopping (no deck) store a TARGET number of
 * copies to own. The stepper beside a search result shows copies still to buy,
 * so each press translates back into a new target.
 */
export type ExtraStepInput = {
  owned: number;
  /** Need from decks alone. */
  deckNeed: number;
  /** Current direct target, 0 when the card was not added directly. */
  extraQty: number;
  /** Copies still to buy on the list (need − owned, never below 0). */
  stillNeed: number;
};

/** New direct target after pressing + (delta 1) or − (delta -1) on the copies-to-buy stepper. 0 removes it. */
export function nextExtraTarget(input: ExtraStepInput, delta: 1 | -1): number {
  const { owned, deckNeed, stillNeed } = input;
  // Copies the list wants you to own right now (decks and direct target combined).
  const listTarget = owned + stillNeed;
  if (delta > 0) return listTarget + 1;
  const next = listTarget - 1;
  // Owned copies and decks already cover this, so nothing needs adding directly.
  if (next <= Math.max(owned, deckNeed)) return 0;
  return next;
}
