import { useQuery } from "@tanstack/react-query";
import { api } from "./api";

export const SHOPPING_DECKS_KEY = "optcg_shopping_deck_ids";

export function loadShoppingDeckFilter(allIds: number[]): number[] | null {
  try {
    const raw = localStorage.getItem(SHOPPING_DECKS_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as number[];
    if (!Array.isArray(parsed)) return null;
    const allowed = new Set(allIds);
    const filtered = parsed.filter((id) => allowed.has(id));
    return filtered.length ? filtered : null;
  } catch {
    return null;
  }
}

/**
 * The decks ticked under Master Shopping's "Include decks", for views that count the same decks
 * (deck pages, Buying hints). undefined means all decks, so those requests stay unfiltered.
 */
export function savedShoppingDeckIds(allIds: number[]): number[] | undefined {
  const saved = loadShoppingDeckFilter(allIds);
  return saved && saved.length < allIds.length ? [...saved].sort((a, b) => a - b) : undefined;
}

export function useSavedShoppingDeckIds(): number[] | undefined {
  const decksQ = useQuery({ queryKey: ["decks"], queryFn: api.decks });
  return decksQ.data ? savedShoppingDeckIds(decksQ.data.map((d) => d.id)) : undefined;
}
