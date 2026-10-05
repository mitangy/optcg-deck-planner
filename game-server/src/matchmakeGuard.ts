import { randomInt } from "node:crypto";
import { requireGameToken } from "./env.js";
import { verifyGameToken } from "./gameToken.js";

/**
 * Colyseus runs a room's *static* onAuth on the matchmake HTTP call, before it
 * creates a room or reserves a seat; the instance onAuth only runs once the
 * WebSocket connects. Without this check anyone could create rooms, or fill a
 * waiting room's seat reservations, with no token at all.
 */
export function checkMatchmakeToken(options: unknown): true {
  if (!requireGameToken()) return true;
  const o = options && typeof options === "object" ? (options as Record<string, unknown>) : {};
  const token = typeof o.gameToken === "string" ? o.gameToken.trim() : "";
  if (!token || !verifyGameToken(token)) {
    throw Object.assign(new Error("gameToken required"), { code: "unauthorized" as const });
  }
  return true;
}

/** Live rooms a single account may have created at once (a left game keeps its room through the reconnect grace). */
export const MAX_ROOMS_PER_CREATOR = 5;
const liveRoomsByCreator = new Map<number, number>();

/** Counts a new room against its creator. Returns the creator id to release on dispose, or null when not counted. */
export function claimCreatorRoom(options: unknown): number | null {
  // Deployed servers only: local dev and e2e reuse one account across many rooms.
  if (!requireGameToken()) return null;
  const o = options && typeof options === "object" ? (options as Record<string, unknown>) : {};
  const token = typeof o.gameToken === "string" ? o.gameToken.trim() : "";
  // Rooms the ranked matchmaker creates carry no token; they are not a player's to flood.
  const payload = token ? verifyGameToken(token) : null;
  if (!payload) return null;
  const live = liveRoomsByCreator.get(payload.uid) ?? 0;
  if (live >= MAX_ROOMS_PER_CREATOR) {
    throw new Error("Too many open rooms; leave one first");
  }
  liveRoomsByCreator.set(payload.uid, live + 1);
  return payload.uid;
}

export function releaseCreatorRoom(uid: number | null): void {
  if (uid === null) return;
  const live = (liveRoomsByCreator.get(uid) ?? 1) - 1;
  if (live > 0) liveRoomsByCreator.set(uid, live);
  else liveRoomsByCreator.delete(uid);
}

/**
 * Shuffle seed for a new game. Deployed servers always pick it from a CSPRNG:
 * a seed a player can guess (a client value, or the clock) lets them replay the
 * shuffles offline and read both decks. Local dev and tests may still pin one.
 */
export function gameSeed(clientSeed?: number): number {
  if (clientSeed !== undefined && !requireGameToken()) return clientSeed;
  return randomInt(0, 2 ** 32);
}
