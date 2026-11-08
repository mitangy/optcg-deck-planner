import { useCallback, useEffect, useRef, useState } from "react";

/**
 * A value some mounted component hands to the provider (the page's context, the open deck, the live game, the
 * board's dock hosts, a modal layer). Only the component that set it can clear it, so a page that mounts before
 * the previous one has unmounted keeps what it registered.
 */
export type SlotSetter<T> = (owner: object, next: T | null) => void;

/** The provider side: the current value and a setter keyed by owner. */
export function useOwnedSlot<T>(): readonly [T | null, SlotSetter<T>] {
  const [value, setValue] = useState<T | null>(null);
  const ownerRef = useRef<object | null>(null);
  const set = useCallback((owner: object, next: T | null) => {
    if (next) {
      ownerRef.current = owner;
      setValue(next);
    } else if (ownerRef.current === owner) {
      ownerRef.current = null;
      setValue(null);
    }
  }, []);
  return [value, set] as const;
}

/** The hook side: registers `value` while the calling component is mounted and clears it on unmount. */
export function useRegisterSlot<T>(set: SlotSetter<T>, value: T | null) {
  const owner = useRef({}).current;
  useEffect(() => {
    set(owner, value);
    return () => set(owner, null);
  }, [value, owner, set]);
}
