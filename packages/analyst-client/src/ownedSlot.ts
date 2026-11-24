import { useCallback, useEffect, useRef, useState } from "react";

// Only the component that set it can clear it, so a page that mounts before the previous one unmounted keeps what it registered.
export type SlotSetter<T> = (owner: object, next: T | null) => void;

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

export function useRegisterSlot<T>(set: SlotSetter<T>, value: T | null) {
  const owner = useRef({}).current;
  useEffect(() => {
    set(owner, value);
    return () => set(owner, null);
  }, [value, owner, set]);
}
