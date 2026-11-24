import { useSyncExternalStore } from "react";

export type Store<T> = {
  get: () => T;
  set: (next: T | ((prev: T) => T)) => void;
  subscribe: (listener: () => void) => () => void;
  use: <S = T>(selector?: (value: T) => S) => S;
};

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
