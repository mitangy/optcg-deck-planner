import type { BotRoomOptions, PlayerDeckWire } from "../net/protocol";

/** What a one-tap rematch needs once the room is gone: the decks, and who to ask. */
export type RematchPlan = {
  deck: PlayerDeckWire;
  /** Set for a bot game: the same bot level and deck start again. */
  bot: BotRoomOptions | null;
  /** The opponent's display name, to find them among the friends. Null for a bot or an unnamed guest. */
  opponentName: string | null;
};

export type ReconnectFailure = "game_gone" | "network" | "other";

// The server closed the room (colyseus: `room "x" has been disposed.` / `room "x" not found`).
const GAME_GONE = /has been disposed|room\s+"?[\w-]*"?\s+not found|no such room/i;
const NETWORK = /failed to fetch|network\s?error|network request failed|load failed|timed? ?out|econn(refused|reset|aborted)|enotfound|offline|bad gateway|service unavailable|\b50[234]\b|websocket|connection (closed|refused|reset|lost)/i;

export function classifyReconnectFailure(err: unknown): ReconnectFailure {
  const msg = err instanceof Error ? err.message : String(err ?? "");
  if (GAME_GONE.test(msg)) return "game_gone";
  if (NETWORK.test(msg) || (err instanceof TypeError && !msg)) return "network";
  return "other";
}

/** Waits between attempts to reach a server that is down or booting; about 80 seconds in all. */
export const RECONNECT_DELAYS_MS: readonly number[] = [1000, 2000, 3000, 4000, 5000, 5000, 5000, 5000, 5000, 5000, 5000, 5000, 5000, 5000, 5000, 5000, 5000];

export type ReconnectResult<T> =
  | { kind: "joined"; value: T }
  /** The server answered and the room is gone. */
  | { kind: "game_gone"; error: unknown }
  /** Still unreachable after every wait. The seat may still be there: offer a manual retry. */
  | { kind: "unreachable"; error: unknown }
  /** Refused for another reason (seat released, token expired). */
  | { kind: "refused"; error: unknown }
  | { kind: "cancelled" };

/**
 * A network drop keeps trying, a missing room stops at once. Only `game_gone` may be shown as "the server restarted":
 * a dropped connection says nothing about the game.
 */
export async function reconnectUntilSettled<T>(opts: {
  attempt: () => Promise<T>;
  active: () => boolean;
  delaysMs?: readonly number[];
  sleep?: (ms: number) => Promise<void>;
}): Promise<ReconnectResult<T>> {
  const delays = opts.delaysMs ?? RECONNECT_DELAYS_MS;
  const sleep = opts.sleep ?? ((ms) => new Promise<void>((r) => setTimeout(r, ms)));
  let last: unknown;
  for (let i = 0; i <= delays.length; i++) {
    if (!opts.active()) return { kind: "cancelled" };
    try {
      return { kind: "joined", value: await opts.attempt() };
    } catch (error) {
      last = error;
      const failure = classifyReconnectFailure(error);
      if (failure === "game_gone") return { kind: "game_gone", error };
      if (failure === "other") return { kind: "refused", error };
    }
    if (i < delays.length) await sleep(delays[i]!);
  }
  return { kind: "unreachable", error: last };
}

/**
 * A room can also be gone because the game ended while this tab was away. The server's process id says whether it restarted:
 * the same id before and after means it did not. When either is unknown, the restart is assumed.
 */
export function gameGoneMeansRestart(bootIdWhenJoined: string | null | undefined, bootIdNow: string | null | undefined): boolean {
  return !(bootIdWhenJoined && bootIdNow && bootIdWhenJoined === bootIdNow);
}

export const GAME_LOST_TITLE = "The server restarted and this game couldn't continue";
export const GAME_LOST_BODY = "It ended with no winner and didn't count.";
export const GAME_ENDED_WHILE_AWAY = "That game is no longer running. It ended while you were away.";
export const UNREACHABLE_BANNER = "Couldn't reach the server. Check your connection, then tap Reconnect.";

/** The friend to invite for a rematch: the opponent's name matched against the friends list. */
export function findRematchFriend<F extends { username: string }>(plan: RematchPlan | null, friends: readonly F[] | undefined): F | null {
  if (!plan || plan.bot || !plan.opponentName || !friends) return null;
  const name = plan.opponentName.trim().toLowerCase();
  return friends.find((f) => f.username.trim().toLowerCase() === name) ?? null;
}
