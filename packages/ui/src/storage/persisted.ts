import { useEffect, useState } from "react";

/** localStorage read that never throws (private mode, blocked storage): null means "nothing usable". */
export function readStored(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

/** localStorage write that never throws: the value still applies for this visit. False when the browser refused (quota, disabled storage). */
export function writeStored(key: string, value: string): boolean {
  try {
    localStorage.setItem(key, value);
    return true;
  } catch {
    /* private mode / blocked storage */
    return false;
  }
}

/** localStorage remove that never throws. False when storage is unavailable. */
export function removeStored(key: string): boolean {
  try {
    localStorage.removeItem(key);
    return true;
  } catch {
    return false;
  }
}

/**
 * How a value is stored. `parse` gets the raw string (never null) and returns the value, or
 * undefined when it is not usable, so the default applies. It may also throw (corrupt JSON).
 */
export type PersistedCodec<T> = {
  parse: (raw: string) => T | undefined;
  serialize: (value: T) => string;
};

/** "1" / "0". Anything but "1" reads as false. */
export const bool01: PersistedCodec<boolean> = {
  parse: (raw) => raw === "1",
  serialize: (value) => (value ? "1" : "0"),
};

/** A string stored as is, accepted only when it is one of `allowed`. */
export function choiceCodec<T extends string = string>(allowed?: readonly T[]): PersistedCodec<T> {
  return {
    parse: (raw) => (!allowed || (allowed as readonly string[]).includes(raw) ? (raw as T) : undefined),
    serialize: (value) => value,
  };
}

/** A JSON array; items failing `isItem` are dropped, a non-array is unusable. */
export function jsonArrayCodec<T>(isItem: (x: unknown) => x is T): PersistedCodec<T[]> {
  return {
    parse: (raw) => {
      const parsed = JSON.parse(raw) as unknown;
      return Array.isArray(parsed) ? parsed.filter(isItem) : undefined;
    },
    serialize: (value) => JSON.stringify(value),
  };
}

/** The same JSON array format, held as a Set. */
export function jsonSetCodec<T>(isItem: (x: unknown) => x is T): PersistedCodec<Set<T>> {
  const arr = jsonArrayCodec(isItem);
  return {
    parse: (raw) => {
      const items = arr.parse(raw);
      return items ? new Set(items) : undefined;
    },
    serialize: (value) => arr.serialize([...value]),
  };
}

/**
 * useState remembered in localStorage across reloads. Reads once on mount (the default applies when
 * nothing usable is stored), writes on every change. Without a key it is plain state.
 */
export function usePersistedState<T>(key: string | undefined, defaultValue: T, codec: PersistedCodec<T>) {
  const [value, setValue] = useState<T>(() => {
    if (!key) return defaultValue;
    const raw = readStored(key);
    if (raw === null) return defaultValue;
    try {
      return codec.parse(raw) ?? defaultValue;
    } catch {
      return defaultValue;
    }
    // The codec is a constant per call site; only the first render reads storage.
  });
  useEffect(() => {
    if (!key) return;
    writeStored(key, codec.serialize(value));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value, key]);
  return [value, setValue] as const;
}
