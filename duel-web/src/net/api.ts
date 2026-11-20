import type { components } from "@optcg/api-client";
import { readFirstTouch } from "@optcg/ui/firstTouch";
import { ApiError, apiCall, apiError, request } from "../api/http";
import { getApiBaseUrl } from "../config";
import { retry } from "../lib/retry";
import { devKeyAllowed, loadSettings } from "../settings";
import { rememberAssignedGameServer } from "./gameServer";

type Schemas = components["schemas"];

export type DuelTokenResponse = Schemas["DuelTokenOut"];

export type AuthUser = {
  id: number;
  email: string;
  name: string;
  username?: string | null;
  role?: "user" | "moderator" | "admin";
};

export { ApiError, apiError };

export async function updateUsername(username: string): Promise<AuthUser> {
  try {
    return await apiCall<AuthUser>(
      "/auth/me/username",
      { method: "PATCH", json: { username: username.trim() } },
      "Could not save username",
    );
  } catch (e) {
    if (e instanceof ApiError && e.message === `Could not save username (${e.status})`) {
      if (e.status === 409) throw new ApiError(e.status, "That username is already taken.");
      if (e.status === 422) throw new ApiError(e.status, "That username isn't allowed.");
    }
    throw e;
  }
}

export async function fetchUsernameSuggestion(): Promise<string | null> {
  try {
    const body = await apiCall<{ username?: string }>("/auth/me/username-suggestion");
    return body?.username ?? null;
  } catch {
    return null;
  }
}

/**
 * True for transient failures worth retrying (cold start, race, rate limit): anything but a 4xx that is not a 429.
 * Decided on the status the API sent, never on the wording of its message.
 */
function isRetryableMintError(err: unknown): boolean {
  if (!(err instanceof ApiError)) return true;
  return !(err.status >= 400 && err.status < 500 && err.status !== 429);
}

function mintErrorDetail(e: unknown, timeoutMs: number): string {
  if (e instanceof ApiError) {
    if (e.code === "timeout") return `Request timed out after ${Math.round(timeoutMs / 1000)}s`;
    if (e.status > 0) return e.message.startsWith("Token mint failed (") ? e.message : `Token mint failed (${e.status}): ${e.message}`;
  }
  return e instanceof Error ? e.message : String(e);
}

/**
 * Mint with per-attempt timeout + retries. Free-tier Render cold starts often
 * exceed a single 8s budget; three attempts with backoff absorb that without
 * hanging the hotseat UI forever.
 */
async function mintWithRetry(
  path: string,
  body: Record<string, string> | null,
  opts?: {
    credentials?: RequestCredentials;
    attempts?: number;
    timeoutMs?: number;
    label?: string;
  },
): Promise<DuelTokenResponse> {
  const timeoutMs = opts?.timeoutMs ?? 20000;
  const label = opts?.label ?? "Token mint";
  try {
    return await retry(
      async () => {
        const token = await request<DuelTokenResponse>(path, {
          method: "POST",
          json: body ?? undefined,
          credentials: opts?.credentials ?? "same-origin",
          timeoutMs,
          fallback: "Token mint failed",
        });
        rememberAssignedGameServer(token);
        return token;
      },
      { attempts: opts?.attempts ?? 3, delayMs: (i) => 400 * i, shouldRetry: isRetryableMintError },
    );
  } catch (e) {
    throw new Error(`${label} failed: ${mintErrorDetail(e, timeoutMs)}`, { cause: e });
  }
}

export async function mintDevGameToken(userKey: string): Promise<DuelTokenResponse> {
  return mintWithRetry("/duel/dev-token", { user_key: userKey }, { label: "Dev token mint" });
}

export async function mintGuestGameToken(guestId: string): Promise<DuelTokenResponse> {
  return mintWithRetry(
    "/duel/guest-token",
    { guest_id: guestId },
    { label: "Guest token mint" },
  );
}

export async function mintSessionGameToken(): Promise<DuelTokenResponse> {
  return mintWithRetry("/duel/token", null, {
    credentials: "include",
    label: "Session token mint",
  });
}

export async function mintOwnerToken(
  owner: "session" | "dev" | undefined,
  devUserKey: string,
): Promise<string | null> {
  if (owner === "session") return (await mintSessionGameToken()).token;
  if (owner === "dev") return (await mintDevGameToken(devUserKey)).token;
  return null;
}

export async function mintAccountGameToken(): Promise<DuelTokenResponse> {
  try {
    return await mintSessionGameToken();
  } catch (e) {
    const settings = loadSettings();
    if (devKeyAllowed() && settings.useDevKey && settings.devUserKey.trim()) {
      return mintDevGameToken(settings.devUserKey.trim());
    }
    throw e;
  }
}

export function warmDuelServices(apiBase: string, gameServerUrl: string): void {
  const api = apiBase.replace(/\/$/, "");
  const gs = gameServerUrl.replace(/\/$/, "");
  void fetch(`${api}/health`).catch(() => undefined);
  void fetch(`${gs}/health`).catch(() => undefined);
}

export async function awaitDuelServicesReady(
  apiBase: string,
  gameServerUrl: string,
  budgetMs = 25000,
): Promise<boolean> {
  const api = apiBase.replace(/\/$/, "");
  const gs = gameServerUrl.replace(/\/$/, "");
  const deadline = Date.now() + budgetMs;
  try {
    return await retry(
      async () => {
        if (Date.now() >= deadline) return false;
        const [a, g] = await Promise.all([
          fetch(`${api}/health`).then((r) => r.ok),
          fetch(`${gs}/health`).then((r) => r.ok),
        ]);
        if (!(a && g)) throw new Error("Services not ready");
        return true;
      },
      {
        attempts: Infinity,
        delayMs: (i) => Math.min(400 * 1.5 ** (i - 1), 2500),
        shouldRetry: () => Date.now() < deadline,
      },
    );
  } catch {
    return false;
  }
}

export function hotseatGuestId(userKey: string, suffix: "a" | "b"): string {
  const cleaned = userKey.replace(/[^a-zA-Z0-9_-]/g, "") || "guest";
  const base = cleaned.slice(0, 62);
  let id = `${base}-${suffix}`;
  if (id.length < 8) id = `${id}${"0".repeat(8 - id.length)}`;
  return id.slice(0, 64);
}

function isHttpError(e: unknown): e is ApiError {
  return e instanceof ApiError && e.status > 0;
}

export async function fetchAuthMe(): Promise<AuthUser | null> {
  try {
    return await apiCall<AuthUser | null>("/auth/me", undefined, "Auth check failed");
  } catch (e) {
    // 401/403 is a real "not signed in". Any other failure (a 502 during a cold start) is not an answer: throw so the
    // session store treats it as a failed check instead of caching it as signed out.
    if (e instanceof ApiError && (e.status === 401 || e.status === 403)) return null;
    throw e;
  }
}

export function claimLoginTicket(ticket: string): Promise<AuthUser> {
  return apiCall<AuthUser>("/auth/claim", { method: "POST", json: { ticket, source: readFirstTouch() } }, "Claim failed");
}

export async function logoutSession(): Promise<void> {
  try {
    await apiCall<unknown>("/auth/logout", { method: "POST" });
  } catch (e) {
    if (!isHttpError(e)) throw e;
  }
}

export function googleLoginUrl(returnTo: string = window.location.origin): string {
  const u = new URL(`${getApiBaseUrl()}/auth/google`, window.location.origin);
  u.searchParams.set("return_to", returnTo);
  return u.toString();
}

export type LeaderboardEntry = Schemas["DuelLeaderboardEntryOut"];

/** Only a 404 (no board yet) is an empty list; a failed load throws so the page can offer Try again. */
export async function fetchLeaderboard(limit = 5, window: "all" | "week" | "month" = "all"): Promise<LeaderboardEntry[]> {
  try {
    const body = await apiCall<Partial<Schemas["DuelLeaderboardOut"]> | null>(`/duel/leaderboard?limit=${limit}&window=${window}`);
    return body?.entries ?? [];
  } catch (e) {
    if (e instanceof ApiError && e.status === 404) return [];
    throw e;
  }
}

export type RatingMe = {
  user_id: number;
  email: string;
  name: string;
  username: string | null;
  rating: number;
  games_played: number;
  wins: number;
  losses: number;
  rank: number | null;
  provisional?: boolean;
};

export async function fetchRatingMe(): Promise<RatingMe | null> {
  try {
    return await apiCall<RatingMe>("/duel/rating/me");
  } catch (e) {
    if (isHttpError(e)) return null;
    throw e;
  }
}

export type LiveCounts = Schemas["DuelLiveOut"];

export async function fetchLive(): Promise<LiveCounts | null> {
  try {
    const j = await apiCall<Partial<LiveCounts> | null>("/duel/live");
    return typeof j?.online === "number" && typeof j.matches === "number" ? { online: j.online, matches: j.matches } : null;
  } catch (e) {
    if (isHttpError(e)) return null;
    throw e;
  }
}
