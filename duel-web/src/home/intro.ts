/** The guest "how it works" strip: shown until dismissed or a match starts from the lobby. */

export const INTRO_KEY = "optcg-duel:homeIntroDone";

type Store = Pick<Storage, "getItem" | "setItem">;

function browserStorage(): Store | null {
  try {
    return typeof localStorage === "undefined" ? null : localStorage;
  } catch {
    return null;
  }
}

export function introDone(storage: Store | null = browserStorage()): boolean {
  try {
    return storage?.getItem(INTRO_KEY) === "1";
  } catch {
    return false;
  }
}

export function markIntroDone(storage: Store | null = browserStorage()): void {
  try {
    storage?.setItem(INTRO_KEY, "1");
  } catch {
    /* blocked storage: the strip shows again next visit */
  }
}

export function introVisible(authMode: "guest" | "google" | "dev", done: boolean): boolean {
  return authMode === "guest" && !done;
}
