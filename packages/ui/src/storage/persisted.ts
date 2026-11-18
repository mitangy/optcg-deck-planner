import { useEffect, useState } from "react";

export function readStored(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

export function writeStored(key: string, value: string): boolean {
  try {
    localStorage.setItem(key, value);
    return true;
  } catch {
    /* private mode / blocked storage */
    return false;
  }
}

export function removeStored(key: string): boolean {
  try {
    localStorage.removeItem(key);
    return true;
  } catch {
    return false;
  }
}

export type PersistedCodec<T> = {
  parse: (raw: string) => T | undefined;
  serialize: (value: T) => string;
};

export const bool01: PersistedCodec<boolean> = {
  parse: (raw) => raw === "1",
  serialize: (value) => (value ? "1" : "0"),
};

export function choiceCodec<T extends string = string>(allowed?: readonly T[]): PersistedCodec<T> {
  return {
    parse: (raw) => (!allowed || (allowed as readonly string[]).includes(raw) ? (raw as T) : undefined),
    serialize: (value) => value,
  };
}

export function jsonArrayCodec<T>(isItem: (x: unknown) => x is T): PersistedCodec<T[]> {
  return {
    parse: (raw) => {
      const parsed = JSON.parse(raw) as unknown;
      return Array.isArray(parsed) ? parsed.filter(isItem) : undefined;
    },
    serialize: (value) => JSON.stringify(value),
  };
}

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
