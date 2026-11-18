import { lookupCard } from "../cards/atlas";
import { readStored, writeStored } from "@optcg/ui/storage";

export type DeckSort = "recent" | "name" | "leader";

export const DECK_SORTS: readonly { id: DeckSort; label: string }[] = [
  { id: "recent", label: "Recently updated" },
  { id: "name", label: "Name" },
  { id: "leader", label: "Leader" },
];

export const DEFAULT_DECK_SORT: DeckSort = "recent";

const SORT_KEY = "optcg.duel.deckListSort.v1";

type ListedDeck = { name: string; leaderId: string; updatedAt: number };

export function parseDeckSort(raw: string | null | undefined): DeckSort {
  return DECK_SORTS.find((s) => s.id === raw)?.id ?? DEFAULT_DECK_SORT;
}

export function loadDeckSort(): DeckSort {
  return parseDeckSort(readStored(SORT_KEY));
}

export function saveDeckSort(sort: DeckSort): void {
  writeStored(SORT_KEY, sort);
}

const leaderName = (deck: ListedDeck) => lookupCard(deck.leaderId).name;

export function filterDecks<T extends ListedDeck>(decks: readonly T[], query: string): T[] {
  const q = query.trim().toLowerCase();
  if (!q) return [...decks];
  return decks.filter((d) => `${d.name}\n${leaderName(d)}\n${d.leaderId}`.toLowerCase().includes(q));
}

const byText = (a: string, b: string) => a.localeCompare(b, undefined, { sensitivity: "base", numeric: true });

export function sortDecks<T extends ListedDeck>(decks: readonly T[], sort: DeckSort): T[] {
  const list = [...decks];
  if (sort === "name") return list.sort((a, b) => byText(a.name, b.name));
  if (sort === "leader") return list.sort((a, b) => byText(leaderName(a), leaderName(b)) || byText(a.name, b.name));
  return list.sort((a, b) => b.updatedAt - a.updatedAt);
}
