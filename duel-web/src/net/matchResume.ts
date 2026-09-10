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
const MAX_AGE_MS = 10 * 60 * 1000; // reconnect grace is ~60s; keep blob a bit longer for UX

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
