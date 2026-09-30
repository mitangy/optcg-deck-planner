import { useQuery } from "@tanstack/react-query";
import type { StatsAtlas } from "./deckStats";

// Fetched on first use only, then shared by every panel on the page.
let atlasPromise: Promise<StatsAtlas> | null = null;
function loadStatsAtlas(): Promise<StatsAtlas> {
  atlasPromise ??= fetch("/deckStats.json")
    .then((res) => {
      if (!res.ok) throw new Error(`Card stats unavailable (${res.status})`);
      return res.json() as Promise<StatsAtlas>;
    })
    .catch((err: unknown) => {
      atlasPromise = null;
      throw err instanceof Error ? err : new Error("Card stats unavailable");
    });
  return atlasPromise;
}

/** The shared atlas query (one fetch for every panel on the page). */
export function useStatsAtlas() {
  return useQuery({ queryKey: ["deck-stats-atlas"], queryFn: loadStatsAtlas, staleTime: Infinity, retry: 1 });
}
