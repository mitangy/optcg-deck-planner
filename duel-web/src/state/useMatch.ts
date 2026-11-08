import { createContext, useContext, useSyncExternalStore } from "react";
import type { MatchState, MatchStore } from "./matchStore";

/** The online session's store (DuelSessionProvider supplies it). */
export const MatchStoreContext = createContext<MatchStore | null>(null);

/**
 * Subscribe to a slice of a match store. `selector` must return a primitive or a reference that only changes
 * when the slice does (the reducer keeps untouched fields referentially equal), so a timer tick does not
 * re-render a component that only reads the chat.
 */
export function useMatchStore<T>(store: MatchStore, selector: (s: MatchState) => T): T {
  return useSyncExternalStore(
    store.subscribe,
    () => selector(store.getSnapshot()),
    () => selector(store.getSnapshot()),
  );
}

/** A slice of the online session's match (`useMatch((m) => m.view)`). Must sit under DuelSessionProvider. */
export function useMatch<T>(selector: (s: MatchState) => T): T {
  const store = useContext(MatchStoreContext);
  if (!store) throw new Error("useMatch outside DuelSessionProvider");
  return useMatchStore(store, selector);
}
