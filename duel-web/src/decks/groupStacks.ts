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

export type CostGroup = {
  cost: number;
  stacks: CardStack[];
  /** Total copies in the group, so the heading reads as the deck curve. */
  cards: number;
};

/** Cheapest first; inside a cost the stacks keep the order they came in. */
export function groupStacksByCost(stacks: readonly CardStack[], costOf: (defId: string) => number): CostGroup[] {
  const groups = new Map<number, CostGroup>();
  for (const s of stacks) {
    const cost = costOf(s.defId);
    const g = groups.get(cost) ?? { cost, stacks: [], cards: 0 };
    g.stacks.push(s);
    g.cards += s.count;
    groups.set(cost, g);
  }
  return [...groups.values()].sort((a, b) => a.cost - b.cost);
}
