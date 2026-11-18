import { createContext, useContext, useSyncExternalStore } from "react";
import type { MatchState, MatchStore } from "./matchStore";

export const MatchStoreContext = createContext<MatchStore | null>(null);

export function useMatchStore<T>(store: MatchStore, selector: (s: MatchState) => T): T {
  return useSyncExternalStore(
    store.subscribe,
    () => selector(store.getSnapshot()),
    () => selector(store.getSnapshot()),
  );
}

export function useMatch<T>(selector: (s: MatchState) => T): T {
  const store = useContext(MatchStoreContext);
  if (!store) throw new Error("useMatch outside DuelSessionProvider");
  return useMatchStore(store, selector);
}
