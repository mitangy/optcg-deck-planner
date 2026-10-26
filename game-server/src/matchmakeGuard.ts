import { randomInt } from "node:crypto";
import type { Seat } from "@optcg/rules";
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

/**
 * Where a pool keeps each account's open-room count. Colyseus' Redis presence
 * satisfies it; a process without Redis keeps the in-memory map above.
 */
export interface RoomCountStore {
  incr(key: string): Promise<number>;
  decr(key: string): Promise<number>;
  expire(key: string, seconds: number): Promise<unknown>;
  del(key: string): unknown;
}

/**
 * A count left behind by a process that died without disposing its rooms
 * expires on its own; every claim pushes the expiry out again.
 */
export const ROOM_COUNT_TTL_S = 6 * 3600;
const roomCountKey = (uid: number) => `duel:rooms:${uid}`;

let sharedCounts: RoomCountStore | null = null;

/** Count open rooms in a store shared by the pool instead of this process's memory (null goes back to memory). */
export function useSharedRoomCounts(store: RoomCountStore | null): void {
  sharedCounts = store;
}

/** Token holder a new room counts against, or null for rooms that are not a player's to flood. */
function creatorUid(options: unknown): number | null {
  // Deployed servers only: local dev and e2e reuse one account across many rooms.
  if (!requireGameToken()) return null;
  const o = options && typeof options === "object" ? (options as Record<string, unknown>) : {};
  const token = typeof o.gameToken === "string" ? o.gameToken.trim() : "";
  // Rooms the ranked matchmaker creates carry no token; they are not a player's to flood.
  const payload = token ? verifyGameToken(token) : null;
  return payload ? payload.uid : null;
}

const tooManyRooms = () => new Error("Too many open rooms; leave one first");

/** Counts a new room against its creator. Returns the creator id to release on dispose, or null when not counted. */
export async function claimCreatorRoom(options: unknown): Promise<number | null> {
  const uid = creatorUid(options);
  if (uid === null) return null;
  const store = sharedCounts;
  if (store) {
    const key = roomCountKey(uid);
    const live = await store.incr(key);
    if (live > MAX_ROOMS_PER_CREATOR) {
      await store.decr(key);
      throw tooManyRooms();
    }
    await store.expire(key, ROOM_COUNT_TTL_S);
    return uid;
  }
  const live = liveRoomsByCreator.get(uid) ?? 0;
  if (live >= MAX_ROOMS_PER_CREATOR) throw tooManyRooms();
  liveRoomsByCreator.set(uid, live + 1);
  return uid;
}

export function releaseCreatorRoom(uid: number | null): void {
  if (uid === null) return;
  const store = sharedCounts;
  if (store) {
    const key = roomCountKey(uid);
    // Fire and forget: dispose must not wait on Redis, and a missed release
    // heals when the key expires.
    void store.decr(key).then((live) => (live <= 0 ? store.del(key) : undefined)).catch(() => {});
    return;
  }
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

/**
 * Who goes first in a room's first game (#549). Deployed servers always flip a
 * coin from a CSPRNG and ignore the client, so nobody can pin the order. Local
 * dev and tests may still pin a seat (default 0) so scripted games repeat.
 */
export function gameFirstSeat(clientFirstSeat?: Seat): Seat {
  if (!requireGameToken()) return clientFirstSeat ?? 0;
  return randomInt(0, 2) as Seat;
}
