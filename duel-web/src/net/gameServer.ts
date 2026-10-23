/**
 * Which game server (Colyseus pool) a match runs on.
 *
 * The API may assign a pool per token (`game_server_url` on the mint
 * response). A match stays on the pool it was created on for its whole life:
 * the resume blob stores that URL, and reconnects use it even when a newer
 * token names another pool. Without an assignment the build-time
 * `VITE_GAME_SERVER_URL` is used, as before.
 */
import { getGameServerUrl, rewriteLoopbackToPageHost } from "../config";

/** The part of a token mint response that assigns a game server. */
export type GameServerAssignment = { game_server_url?: string | null };

function assignedUrl(token: GameServerAssignment | null | undefined): string | null {
  const raw = token?.game_server_url;
  if (typeof raw !== "string") return null;
  const url = raw.trim().replace(/\/+$/, "");
  return url ? rewriteLoopbackToPageHost(url) : null;
}

/** Game server for a match started with `token`: its assigned pool, else `fallback` (the build-time URL). */
export function gameServerUrlFor(
  token: GameServerAssignment | null | undefined,
  fallback: string = getGameServerUrl(),
): string {
  return assignedUrl(token) ?? fallback;
}

/**
 * A server URL named by someone else (a friend's invite or presence): https
 * only, except localhost for dev, with no credentials or query. The API checks
 * the same rules; this keeps a bad value from ever being dialled.
 */
export function validServerUrl(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const trimmed = raw.trim().replace(/\/+$/, "");
  let u: URL;
  try {
    u = new URL(trimmed);
  } catch {
    return null;
  }
  const local = u.hostname === "localhost" || u.hostname === "127.0.0.1";
  if (u.protocol !== "https:" && !(u.protocol === "http:" && local)) return null;
  if (u.username || u.password || u.search || u.hash) return null;
  return rewriteLoopbackToPageHost(trimmed);
}

/**
 * Game server to dial for a room someone else opened. Their room lives on the
 * server it was made on, which is not the pool new games get once the API's
 * pointer has flipped; without a usable hint the current assignment is used.
 */
export function roomServerUrl(assigned: string, hint: string | null | undefined): string {
  return validServerUrl(hint) ?? assigned;
}

const LAST_POOL_KEY = "optcg.duel.gameServer.v1";

/** Remember the latest token's pool so the lobby warms that server before the next mint. */
export function rememberAssignedGameServer(token: GameServerAssignment | null | undefined): void {
  try {
    const url = assignedUrl(token);
    if (url) localStorage.setItem(LAST_POOL_KEY, url);
    else localStorage.removeItem(LAST_POOL_KEY);
  } catch {
    /* storage disabled: warm-up falls back to the build-time URL */
  }
}

/** Pool the last token was assigned (null when none, or the API does not assign pools). Warm-up only. */
export function rememberedGameServerUrl(): string | null {
  try {
    return assignedUrl({ game_server_url: localStorage.getItem(LAST_POOL_KEY) });
  } catch {
    return null;
  }
}
