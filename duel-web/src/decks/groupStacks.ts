/** One distinct card id in a deck, with copy count for the stack badge. */
export type CardStack = {
  defId: string;
  count: number;
};

export type DeckStacks = {
  leader: CardStack;
  main: CardStack[];
};

/** Group main-deck copies by unique defId; leader is always a ×1 stack. */
export function groupDeckStacks(leaderId: string, cards: string[]): DeckStacks {
  const counts = new Map<string, number>();
  for (const id of cards) {
    counts.set(id, (counts.get(id) ?? 0) + 1);
  }
  const main = [...counts.entries()]
    .map(([defId, count]) => ({ defId, count }))
    .sort((a, b) => a.defId.localeCompare(b.defId));
  return {
    leader: { defId: leaderId, count: 1 },
    main,
  };
}

/** Most cards a stack is drawn as in the deck editor; the badge still shows the exact count. */
export const MAX_STACK_LAYERS = 4;

/** Copy layers drawn behind the front card: one per extra copy, up to the cap. */
export function stackLayerCount(count: number): number {
  return Math.max(0, Math.min(count, MAX_STACK_LAYERS) - 1);
}
