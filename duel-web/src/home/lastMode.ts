export type LastMode = "hotseat" | "bot" | "create" | "queue";

export const LAST_MODE_KEY = "optcg-duel:lastPlayMode";

type Store = Pick<Storage, "getItem" | "setItem">;

function browserStorage(): Store | null {
  try {
    return typeof localStorage === "undefined" ? null : localStorage;
  } catch {
    return null;
  }
}

export function toLastMode(raw: string | null | undefined): LastMode | null {
  if (raw === "join") return "create";
  return raw === "hotseat" || raw === "bot" || raw === "create" || raw === "queue" ? raw : null;
}

export function readLastMode(storage: Store | null = browserStorage()): LastMode | null {
  try {
    return toLastMode(storage?.getItem(LAST_MODE_KEY));
  } catch {
    return null;
  }
}

export function writeLastMode(mode: string, storage: Store | null = browserStorage()): void {
  const last = toLastMode(mode);
  if (!last) return;
  try {
    storage?.setItem(LAST_MODE_KEY, last);
  } catch {
    /* blocked storage: Play falls back to the default mode next time */
  }
}
