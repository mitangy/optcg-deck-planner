import { readStored, writeStored } from "@optcg/ui/storage";
import { useQuery } from "@tanstack/react-query";
import { api } from "../../api";
import { SHOPPING_DECKS_KEY } from "../../storage/keys";
import { qk } from "../../cache/queryKeys";

export function loadShoppingDeckFilter(allIds: number[]): number[] | null {
  try {
    const raw = readStored(SHOPPING_DECKS_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as number[];
    if (!Array.isArray(parsed)) return null;
    // An empty pick is kept: no decks ticked, only the Other chips (#1208).
    if (parsed.length === 0) return [];
    const allowed = new Set(allIds);
    const filtered = parsed.filter((id) => allowed.has(id));
    return filtered.length ? filtered : null;
  } catch {
    return null;
  }
}

export function saveShoppingDeckFilter(ids: number[]): void {
  // Blocked storage: the choice still applies for this visit.
  writeStored(SHOPPING_DECKS_KEY, JSON.stringify(ids));
}

/**
 * The decks ticked under Master Shopping's "Include decks", for views that count the same decks
 * (deck pages, Buying hints). undefined means all decks, so those requests stay unfiltered. An
 * empty selection (#1208) also reads as all decks there: a deck page is never counted against zero decks.
 */
export function savedShoppingDeckIds(allIds: number[]): number[] | undefined {
  const saved = loadShoppingDeckFilter(allIds);
  return saved && saved.length > 0 && saved.length < allIds.length ? [...saved].sort((a, b) => a - b) : undefined;
}

export function useSavedShoppingDeckIds(): number[] | undefined {
  const decksQ = useQuery({ queryKey: qk.decks(), queryFn: api.decks });
  return decksQ.data ? savedShoppingDeckIds(decksQ.data.map((d) => d.id)) : undefined;
}
