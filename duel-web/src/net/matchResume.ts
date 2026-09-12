/**
 * Persist enough state to resume a duel/hotseat after a full page reload.
 * Uses sessionStorage so closing the tab clears the resume blob.
 */

export type DuelResumeBlob = {
  mode: "duel";
  serverUrl: string;
  roomId: string;
  reconnectionToken: string;
  seat: 0 | 1;
  savedAt: number;
};

export type HotseatResumeBlob = {
  mode: "hotseat";
  serverUrl: string;
  roomId: string;
  secret?: string;
  userKey: string;
  useToken: boolean;
  deckWire: { leaderId: string; deck: string[] };
  deckName: string;
  /** Opponent deck for vs-self (optional for older resume blobs). */
  enemyDeckWire?: { leaderId: string; deck: string[] };
  enemyDeckName?: string;
  seats: [
    { reconnectionToken: string },
    { reconnectionToken: string },
  ];
  /** Which seat had device control when the blob was saved. */
  activeSeat?: 0 | 1;
  savedAt: number;
};

export type MatchResumeBlob = DuelResumeBlob | HotseatResumeBlob;

const KEY = "optcg.duel.matchResume.v1";
/**
 * Colyseus `allowReconnection` grace is ~60s (`RECONNECT_GRACE_SECONDS`).
 * Keeping the blob for 10 minutes previously caused every refresh after the
 * grace window to burn boot budget on "seat reservation expired" before a
 * fresh hotseat mint — and free-tier cold starts then hit the mint timeout.
 * Keep only a small buffer past grace so resume is attempted only while the
 * server may still reclaim the seat.
 */
export const RECONNECT_GRACE_MS = 60 * 1000;
export const MAX_AGE_MS = RECONNECT_GRACE_MS + 15 * 1000;

/** True while Colyseus may still accept the reconnection token. */
export function isResumeWithinGrace(savedAt: number, now = Date.now()): boolean {
  return now - savedAt <= RECONNECT_GRACE_MS;
}

export function saveMatchResume(blob: MatchResumeBlob): void {
  try {
    sessionStorage.setItem(KEY, JSON.stringify({ ...blob, savedAt: Date.now() }));
  } catch {
    /* private mode / quota */
  }
}

export function loadMatchResume(): MatchResumeBlob | null {
  try {
    const raw = sessionStorage.getItem(KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as MatchResumeBlob;
    if (!parsed || typeof parsed !== "object") return null;
    if (parsed.mode !== "duel" && parsed.mode !== "hotseat") return null;
    if (typeof parsed.savedAt !== "number" || Date.now() - parsed.savedAt > MAX_AGE_MS) {
      clearMatchResume();
      return null;
    }
    if (parsed.mode === "duel") {
      if (!parsed.reconnectionToken || !parsed.roomId || !parsed.serverUrl) return null;
      return parsed;
    }
    if (
      !parsed.roomId ||
      !parsed.serverUrl ||
      !parsed.seats?.[0]?.reconnectionToken ||
      !parsed.seats?.[1]?.reconnectionToken
    ) {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

export function clearMatchResume(): void {
  try {
    sessionStorage.removeItem(KEY);
  } catch {
    /* ignore */
  }
}
