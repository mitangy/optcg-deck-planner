import { getGameServerUrl, rewriteLoopbackToPageHost } from "../config";
import { readStored, removeStored, writeStored } from "@optcg/ui/storage";

export type GameServerAssignment = { game_server_url?: string | null };

function assignedUrl(token: GameServerAssignment | null | undefined): string | null {
  const raw = token?.game_server_url;
  if (typeof raw !== "string") return null;
  const url = raw.trim().replace(/\/+$/, "");
  return url ? rewriteLoopbackToPageHost(url) : null;
}

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

export function rememberAssignedGameServer(token: GameServerAssignment | null | undefined): void {
  const url = assignedUrl(token);
  if (url) writeStored(LAST_POOL_KEY, url);
  else removeStored(LAST_POOL_KEY);
}

export function rememberedGameServerUrl(): string | null {
  return assignedUrl({ game_server_url: readStored(LAST_POOL_KEY) });
}
