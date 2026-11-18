import { readStored, writeStored } from "@optcg/ui/storage";
import { useQuery } from "@tanstack/react-query";
import { api } from "../../api";
import { SHOPPING_DECKS_KEY } from "../../storage/keys";
import { qk } from "../../cache/queryKeys";

const NO_DECKS = "none";

export function loadShoppingDeckFilter(allIds: number[]): number[] | null {
  try {
    const raw = readStored(SHOPPING_DECKS_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as unknown;
    if (parsed === NO_DECKS) return [];
    if (!Array.isArray(parsed)) return null;
    const allowed = new Set(allIds);
    const filtered = (parsed as number[]).filter((id) => allowed.has(id));
    return filtered.length ? filtered : null;
  } catch {
    return null;
  }
}

export function saveShoppingDeckFilter(ids: number[]): void {
  // Blocked storage: the choice still applies for this visit.
  writeStored(SHOPPING_DECKS_KEY, JSON.stringify(ids.length ? ids : NO_DECKS));
}

export function savedShoppingDeckIds(allIds: number[]): number[] | undefined {
  const saved = loadShoppingDeckFilter(allIds);
  return saved && saved.length > 0 && saved.length < allIds.length ? [...saved].sort((a, b) => a - b) : undefined;
}

export function useSavedShoppingDeckIds(): number[] | undefined {
  const decksQ = useQuery({ queryKey: qk.decks(), queryFn: api.decks });
  return decksQ.data ? savedShoppingDeckIds(decksQ.data.map((d) => d.id)) : undefined;
}
