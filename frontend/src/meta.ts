import { DECK_NAME_MAX, META_DEFAULT_DAYS, formatDeckRow, formatMetaDate, formatPercent, metaDeckName, ordinal } from "@optcg/deck-analytics/metaFormat";
import type { MetaDeck, MetaDeckCard } from "./api";

// One copy of the meta-deck text rules for both apps.
export { DECK_NAME_MAX, META_DEFAULT_DAYS, formatDeckRow, formatMetaDate, formatPercent, metaDeckName, ordinal };

export const META_DAY_OPTIONS = [7, 14, 30] as const;

export type CostGroup = { label: string; cards: MetaDeckCard[] };

/** Group a decklist by cost (cheapest first). Cards without a numeric cost land last under "Other". */
export function groupCardsByCost(cards: MetaDeckCard[]): CostGroup[] {
  const byCost = new Map<number, MetaDeckCard[]>();
  const other: MetaDeckCard[] = [];
  for (const card of cards) {
    const cost = card.cost.trim() === "" ? NaN : Number(card.cost);
    if (Number.isNaN(cost)) {
      other.push(card);
      continue;
    }
    const list = byCost.get(cost) ?? [];
    list.push(card);
    byCost.set(cost, list);
  }
  const groups = [...byCost.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([cost, list]) => ({ label: `Cost ${cost}`, cards: list }));
  if (other.length) groups.push({ label: "Other", cards: other });
  return groups;
}

export type CreateMetaDeckDeps = {
  createDeck: (name: string, decklist: string) => Promise<{ id: number }>;
  onCreated: () => Promise<unknown> | unknown;
  navigate: (path: string) => void;
};

/** Create a planner deck from a tournament list, then open it. Posts the deck's `text` untouched. */
export async function createMetaDeck(
  leader: { id: string; name: string },
  deck: Pick<MetaDeck, "placing" | "event" | "text">,
  deps: CreateMetaDeckDeps,
): Promise<number> {
  const created = await deps.createDeck(metaDeckName(leader.name, leader.id, deck), deck.text);
  await deps.onCreated();
  deps.navigate(`/decks/${created.id}`);
  return created.id;
}
