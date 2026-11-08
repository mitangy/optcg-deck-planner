import { useSyncExternalStore } from "react";

export type Store<T> = {
  get: () => T;
  /** Replace the value (or derive it from the previous one). Listeners run only when it actually changed. */
  set: (next: T | ((prev: T) => T)) => void;
  subscribe: (listener: () => void) => () => void;
  /**
   * React hook: the whole value, or `selector(value)`. A component re-renders only when the selected value
   * changes, so a selector must return something stable (a field, not a fresh object or array).
   */
  use: <S = T>(selector?: (value: T) => S) => S;
};

/** A tiny external store for `useSyncExternalStore`: one value, a listener set, no provider. */
export function createStore<T>(initial: T): Store<T> {
  let value = initial;
  const listeners = new Set<() => void>();
  const get = () => value;
  const subscribe = (listener: () => void) => {
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  };
  const set = (next: T | ((prev: T) => T)) => {
    const resolved = typeof next === "function" ? (next as (prev: T) => T)(value) : next;
    if (Object.is(resolved, value)) return;
    value = resolved;
    // A listener may unsubscribe while we notify; iterate a copy.
    [...listeners].forEach((l) => l());
  };
  function use<S = T>(selector?: (v: T) => S): S {
    const select = selector ?? ((v: T) => v as unknown as S);
    return useSyncExternalStore(
      subscribe,
      () => select(value),
      () => select(initial),
    );
  }
  return { get, set, subscribe, use };
}
