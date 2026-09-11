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
