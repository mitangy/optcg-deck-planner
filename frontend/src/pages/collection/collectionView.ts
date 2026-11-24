import { matchesCardSearch } from "../../ui/cardListControls";

export const COLLECTION_TYPES = ["Leader", "Character", "Event", "Stage"] as const;

export function cardColorNames(card: { color: string }): string[] {
  return card.color
    .split(/[/,&]+/)
    .map((p) => p.trim())
    .filter(Boolean);
}

export function cardHasColor(card: { color: string }, colors: string[]): boolean {
  const parts = cardColorNames(card).map((p) => p.toLowerCase());
  return colors.some((c) => parts.includes(c.toLowerCase()));
}

export function cardHasType(card: { card_type?: string | null }, type: string): boolean {
  if (!type) return true;
  return (card.card_type ?? "").trim().toLowerCase() === type.toLowerCase();
}

export function typesPresent(items: { card_type?: string | null }[]): string[] {
  return COLLECTION_TYPES.filter((t) => items.some((i) => cardHasType(i, t)));
}

type Filterable = {
  card_id: string;
  name: string;
  color: string;
  card_type?: string;
  rarity?: string;
  used_in: string[];
};

export function filterOwnedCards<T extends Filterable>(
  items: T[],
  f: { colors: string[]; type: string; sparesOnly: boolean; search: string },
): T[] {
  let list = items;
  if (f.sparesOnly) list = list.filter((i) => i.used_in.length === 0);
  if (f.colors.length) list = list.filter((i) => cardHasColor(i, f.colors));
  if (f.type) list = list.filter((i) => cardHasType(i, f.type));
  if (f.search.trim()) list = list.filter((i) => matchesCardSearch(i, f.search));
  return list;
}
