import { matchesCardSearch } from "./cardListControls";

/** Card types offered as chips on the Collection page (DON!! has its own "Show DON!!" filter). */
export const COLLECTION_TYPES = ["Leader", "Character", "Event", "Stage"] as const;

/** "Red/Green" (or "Red, Green") as ["Red", "Green"]. */
export function cardColorNames(card: { color: string }): string[] {
  return card.color
    .split(/[/,&]+/)
    .map((p) => p.trim())
    .filter(Boolean);
}

/** True when the card has any of `colors` (a two-colour card matches either of its colours). */
export function cardHasColor(card: { color: string }, colors: string[]): boolean {
  const parts = cardColorNames(card).map((p) => p.toLowerCase());
  return colors.some((c) => parts.includes(c.toLowerCase()));
}

/** `type` is "" for every type. */
export function cardHasType(card: { card_type?: string | null }, type: string): boolean {
  if (!type) return true;
  return (card.card_type ?? "").trim().toLowerCase() === type.toLowerCase();
}

/** The chips worth showing: the types present in the collection, in the usual order. */
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

/** The Collection page's own filters: colour chips (any of), the type chip, "Not in a deck" and the search box. */
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
