import { useEffect, useSyncExternalStore } from "react";
import type { StatsAtlas } from "../deckStats";
// Bundled as a hashed asset by each app's Vite build, fetched on first use only.
import atlasUrl from "../../deckStats.json?url";

type AtlasState = { data: StatsAtlas | null; error: Error | null; loading: boolean };

let state: AtlasState = { data: null, error: null, loading: false };
const listeners = new Set<() => void>();

function setState(next: AtlasState) {
  state = next;
  for (const l of listeners) l();
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

async function fetchAtlas(): Promise<StatsAtlas> {
  const res = await fetch(atlasUrl);
  if (!res.ok) throw new Error(`Card stats unavailable (${res.status})`);
  return (await res.json()) as StatsAtlas;
}

/** Starts the atlas download unless it is loaded or in flight. One retry before giving up. */
export function loadStatsAtlas(): void {
  if (state.data || state.loading) return;
  setState({ data: null, error: null, loading: true });
  fetchAtlas()
    .catch(() => fetchAtlas())
    .then(
      (data) => setState({ data, error: null, loading: false }),
      (err: unknown) => setState({ data: null, error: err instanceof Error ? err : new Error("Card stats unavailable"), loading: false }),
    );
}

/** The shared atlas (one fetch for every panel on the page). */
export function useStatsAtlas() {
  const s = useSyncExternalStore(subscribe, () => state, () => state);
  useEffect(() => {
    if (!state.data && !state.error) loadStatsAtlas();
  }, []);
  return { data: s.data ?? undefined, error: s.error, isLoading: !s.data && !s.error, refetch: loadStatsAtlas };
}
