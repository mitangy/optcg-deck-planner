/** Display order for hand cards: cost asc, then defId (groups duplicates), then stable index. */
export function sortHandIndices(
  hand: ReadonlyArray<{ defId: string }>,
  lookupCost: (defId: string) => number,
): number[] {
  const indices = hand.map((_, i) => i);
  return indices.sort((a, b) => {
    const costA = lookupCost(hand[a]!.defId);
    const costB = lookupCost(hand[b]!.defId);
    if (costA !== costB) return costA - costB;
    const defCompare = hand[a]!.defId.localeCompare(hand[b]!.defId);
    if (defCompare !== 0) return defCompare;
    return a - b;
  });
}
