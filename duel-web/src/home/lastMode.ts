/** The Play mode a player used last, kept in this browser so Play can repeat it. */

export type LastMode = "hotseat" | "create" | "queue" | "spectate";

export const LAST_MODE_KEY = "optcg-duel:lastPlayMode";

type Store = Pick<Storage, "getItem" | "setItem">;

function browserStorage(): Store | null {
  try {
    return typeof localStorage === "undefined" ? null : localStorage;
  } catch {
    return null;
  }
}

/** Joining a room is the private room mode; anything unknown is no mode. */
export function toLastMode(raw: string | null | undefined): LastMode | null {
  if (raw === "join") return "create";
  return raw === "hotseat" || raw === "create" || raw === "queue" || raw === "spectate" ? raw : null;
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
    /* blocked storage: Play just opens the chooser next time */
  }
}
