export type CardStack = {
  defId: string;
  count: number;
};

export type DeckStacks = {
  leader: CardStack;
  main: CardStack[];
};

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
