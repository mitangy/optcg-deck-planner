import type { SavedDeck } from "../decks/storage";

export const JOIN_FAILED_MESSAGE = "That room has closed or is full. Ask for a new link.";
/** A join that has not seated you by now is stuck (cold server, dead room): fall back to the join sheet. */
export const JOIN_TIMEOUT_MS = 20_000;

const OWN_ROOMS_KEY = "optcg-duel:ownRooms";
const FALLBACK_KEY = "optcg-duel:joinFallbackRoom";
const MAX_OWN_ROOMS = 20;

/** Rooms this browser opened, so /join/<own room> tells the host to send the link on instead of sitting in their own room. */
export function rememberOwnRoom(roomId: string): void {
  try {
    const rooms = (JSON.parse(localStorage.getItem(OWN_ROOMS_KEY) ?? "[]") as string[]).filter((r) => r !== roomId);
    localStorage.setItem(OWN_ROOMS_KEY, JSON.stringify([...rooms, roomId].slice(-MAX_OWN_ROOMS)));
  } catch {
    /* storage unavailable: the guard just does not fire */
  }
}

export function isOwnRoom(roomId: string): boolean {
  try {
    const rooms = JSON.parse(localStorage.getItem(OWN_ROOMS_KEY) ?? "[]") as unknown;
    return Array.isArray(rooms) && rooms.includes(roomId);
  } catch {
    return false;
  }
}

/** The lobby opens the join sheet with this room prefilled once, after an auto-join did not work out. */
export function stashJoinFallback(roomId: string): void {
  try {
    sessionStorage.setItem(FALLBACK_KEY, roomId);
  } catch {
    /* ignore */
  }
}

export function takeJoinFallback(): string | null {
  try {
    const room = sessionStorage.getItem(FALLBACK_KEY);
    if (room) sessionStorage.removeItem(FALLBACK_KEY);
    return room;
  } catch {
    return null;
  }
}

export function withTimeout<T>(work: Promise<T>, ms: number, onTimeout: () => void): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => {
      onTimeout();
      reject(new Error("timeout"));
    }, ms);
    work.then(
      (v) => {
        clearTimeout(timer);
        resolve(v);
      },
      (e: unknown) => {
        clearTimeout(timer);
        reject(e);
      },
    );
  });
}

/** The deck the finished match was played with, not whatever is selected now; the selection is the fallback when it is gone or unknown. */
export function pickInviteDeck(decks: readonly SavedDeck[], playedDeckId: string | null, selected: SavedDeck | null): SavedDeck | null {
  return (playedDeckId ? decks.find((d) => d.id === playedDeckId) : undefined) ?? selected;
}
