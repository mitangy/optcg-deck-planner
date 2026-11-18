import type { CollectorLine, ShoppingItem } from "../../api";
import { collectorSelectKey } from "../collection/collectorLines";
import type { MassEntryCard } from "./tcgplayerMassEntry";

export type ShoppingSelection = {
  items: ShoppingItem[];
  lines: { item: ShoppingItem; line: CollectorLine }[];
};

/** The ticked cards and the ticked extra (collector) copies. Ids saved from an older list that are gone now are ignored. */
export function pickSelection(items: ShoppingItem[], selectedIds: ReadonlySet<string>): ShoppingSelection {
  const picked: ShoppingSelection = { items: [], lines: [] };
  for (const item of items) {
    if (selectedIds.has(item.card_id)) picked.items.push(item);
    for (const line of item.collector_wants ?? []) {
      if (selectedIds.has(collectorSelectKey(item.card_id, line.product_id))) picked.lines.push({ item, line });
    }
  }
  return picked;
}

/**
 * What "Buy on TCGPlayer" sends. With cards ticked, only those. With nothing ticked, every card that still needs
 * copies in the list's decks scope, extra copies included: the same cards as the Cards to buy and Est. cost totals,
 * whatever the search box, Still need only or Show DON!! say.
 */
export function buyCards(items: ShoppingItem[], selection: ShoppingSelection): MassEntryCard[] {
  const fromLine = ({ item, line }: { item: ShoppingItem; line: CollectorLine }): MassEntryCard => ({
    card_id: item.card_id,
    name: `${item.name} (${line.label})`,
    still_need: line.still_need,
    product_id: line.product_id,
  });
  if (selection.items.length + selection.lines.length > 0) return [...selection.items, ...selection.lines.map(fromLine)];
  const all = items.filter((i) => i.still_need > 0);
  const lines = items.flatMap((item) => (item.collector_wants ?? []).filter((l) => l.still_need > 0).map((line) => ({ item, line })));
  return [...all, ...lines.map(fromLine)];
}

/** Why the Need number is what it is, for its tooltip (replaces the old "Need 4 = most of ..." sentence). */
export function needExplanation(item: ShoppingItem, sortedUnder?: string): string {
  const parts = item.need_by_leader ?? [];
  const lines: string[] = [];
  if (parts.length >= 2) {
    const each = parts.map((p) => `${p.label} ${p.need}`).join(", ");
    lines.push(
      item.need_summed
        ? `${item.need} copies: each leader needs its own (${each})`
        : `${item.need} copies: the most any one leader needs, shared between leaders (${each})`,
    );
  } else if ((item.deck_need ?? 0) > 0) {
    lines.push(`${item.need} copies from your decks`);
  }
  if ((item.extra_qty ?? 0) > 0) lines.push("Includes copies you added directly");
  if (sortedUnder) lines.push(`Sorted under ${sortedUnder}`);
  return lines.join(". ");
}

/** Deck chips for the Used in cell. With copies split by leader, the chips carry the count ("Luffy & Ace ×4"). */
export function usedInChips(item: ShoppingItem): string[] {
  const parts = item.need_by_leader ?? [];
  const chips = parts.length >= 2 ? parts.map((p) => `${p.label} ×${p.need}`) : [...item.used_in];
  if ((item.extra_qty ?? 0) > 0) chips.push("Added directly");
  return chips;
}
