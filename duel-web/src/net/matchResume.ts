import type { RematchPlan } from "../state/connectionLoss";

export type DuelResumeBlob = {
  mode: "duel";
  serverUrl: string;
  roomId: string;
  reconnectionToken: string;
  seat: 0 | 1;
  /** What a rematch needs if the room is gone when this tab comes back (#1500). */
  rematchPlan?: RematchPlan | null;
  /** The game server's process id when this game started, to tell a restart from a game that ended while away (#1500). */
  bootId?: string | null;
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
  enemyDeckWire?: { leaderId: string; deck: string[] };
  enemyDeckName?: string;
  owner?: "session" | "dev";
  seats: [
    { reconnectionToken: string },
    { reconnectionToken: string },
  ];
  activeSeat?: 0 | 1;
  savedAt: number;
};

export type MatchResumeBlob = DuelResumeBlob | HotseatResumeBlob;

const KEY = "optcg.duel.matchResume.v1";
export const RECONNECT_GRACE_MS = 120 * 1000;
export const MAX_AGE_MS = RECONNECT_GRACE_MS + 15 * 1000;

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

export function touchMatchResume(now = Date.now()): void {
  try {
    const raw = sessionStorage.getItem(KEY);
    if (!raw) return;
    const parsed = JSON.parse(raw) as MatchResumeBlob;
    if (!parsed || typeof parsed !== "object") return;
    sessionStorage.setItem(KEY, JSON.stringify({ ...parsed, savedAt: now }));
  } catch {
    /* private mode / quota / corrupt blob */
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


export function isSeatReservationExpiredError(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err ?? "");
  return /seat reservation expired/i.test(msg);
}

export function seatReservationUserMessage(): string {
  return "Could not claim a seat (game server was slow to accept the join). Tap Retry — usually works once the server is warm.";
}
