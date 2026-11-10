/** Duel-web ↔ FastAPI helpers (tokens + light auth). */
import type { components } from "@optcg/api-client";
import { readFirstTouch } from "@optcg/ui/firstTouch";
import { ApiError, apiCall, apiError, request } from "../api/http";
import { getApiBaseUrl } from "../config";
import { retry } from "../lib/retry";
import { devKeyAllowed, loadSettings } from "../settings";
import { rememberAssignedGameServer } from "./gameServer";

// Response shapes come from the backend's OpenAPI schema (node tools/ci/openapi-types.cjs); the aliases keep the names
// callers use. Not generated: AuthUser (the backend sends `role` as a plain string and has two more required fields) and RatingMe
// (the schema leaves `rank` and `username` optional where callers rely on null).
type Schemas = components["schemas"];

/** A game token (`token`) plus who it is for. `game_server_url` null / absent: use the build-time VITE_GAME_SERVER_URL (see net/gameServer.ts). */
export type DuelTokenResponse = Schemas["DuelTokenOut"];

export type AuthUser = {
  id: number;
  email: string;
  name: string;
  /** Public duel handle; null until chosen (see UsernameSetupPage). */
  username?: string | null;
  /** Account role; staff are "moderator" and "admin". Missing on older API builds. */
  role?: "user" | "moderator" | "admin";
};

// ApiError / apiError live in api/http.ts (the shared client); re-exported so existing imports keep working.
export { ApiError, apiError };

/** PATCH /auth/me/username — returns the updated user. */
export async function updateUsername(username: string): Promise<AuthUser> {
  try {
    return await apiCall<AuthUser>(
      "/auth/me/username",
      { method: "PATCH", json: { username: username.trim() } },
      "Could not save username",
    );
  } catch (e) {
    // The server's own sentence still wins; only when it sent none do 409 / 422 get a plainer one than "(409)".
    if (e instanceof ApiError && e.message === `Could not save username (${e.status})`) {
      if (e.status === 409) throw new ApiError(e.status, "That username is already taken.");
      if (e.status === 422) throw new ApiError(e.status, "That username isn't allowed.");
    }
    throw e;
  }
}

/** GET /auth/me/username-suggestion — an available default derived from the account name. */
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

/** What went wrong, worded as a mint failure always was ("Token mint failed (503): ..."). */
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
          // The browser default (same-origin) unless the caller asks for the session cookie.
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

/** Cookie-free token mint (ENABLE_DEV_LOGIN or ENABLE_DUEL_DEV_TOKEN). */
export async function mintDevGameToken(userKey: string): Promise<DuelTokenResponse> {
  return mintWithRetry("/duel/dev-token", { user_key: userKey }, { label: "Dev token mint" });
}

/** Stable-browser guest id → rated identity (always available). */
export async function mintGuestGameToken(guestId: string): Promise<DuelTokenResponse> {
  return mintWithRetry(
    "/duel/guest-token",
    { guest_id: guestId },
    { label: "Guest token mint" },
  );
}

/** Session-cookie token mint (Google / claimed login). */
export async function mintSessionGameToken(): Promise<DuelTokenResponse> {
  return mintWithRetry("/duel/token", null, {
    credentials: "include",
    label: "Session token mint",
  });
}

/**
 * Game token of the account that owns this device's seats, or null for a guest
 * (a guest id is per browser, so there is nothing to move to another device).
 */
export async function mintOwnerToken(
  owner: "session" | "dev" | undefined,
  devUserKey: string,
): Promise<string | null> {
  if (owner === "session") return (await mintSessionGameToken()).token;
  if (owner === "dev") return (await mintDevGameToken(devUserKey)).token;
  return null;
}

/**
 * Token for "Play here instead": the signed-in session, else the dev key when
 * this browser plays under one. The caller cannot tell which account it is.
 */
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

/**
 * Best-effort wake for free-tier Render services so the first hotseat mint /
 * Colyseus create is not the cold-start request.
 */
export function warmDuelServices(apiBase: string, gameServerUrl: string): void {
  const api = apiBase.replace(/\/$/, "");
  const gs = gameServerUrl.replace(/\/$/, "");
  void fetch(`${api}/health`).catch(() => undefined);
  void fetch(`${gs}/health`).catch(() => undefined);
}

/** Poll until game-server /health responds or budget expires (free-tier wake). */
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
        // The wait before this try ran past the budget.
        if (Date.now() >= deadline) return false;
        const [a, g] = await Promise.all([
          fetch(`${api}/health`).then((r) => r.ok),
          fetch(`${gs}/health`).then((r) => r.ok),
        ]);
        // Still cold.
        if (!(a && g)) throw new Error("Services not ready");
        return true;
      },
      {
        attempts: Infinity,
        // 400ms, 600, 900, 1350, 2025, then 2500 between polls.
        delayMs: (i) => Math.min(400 * 1.5 ** (i - 1), 2500),
        shouldRetry: () => Date.now() < deadline,
      },
    );
  } catch {
    return false;
  }
}

/**
 * Build a guest_id that always satisfies the API regex (8–64 of [A-Za-z0-9_-]).
 * Hotseat appends `-a` / `-b` so two seats never share one rated identity.
 */
export function hotseatGuestId(userKey: string, suffix: "a" | "b"): string {
  const cleaned = userKey.replace(/[^a-zA-Z0-9_-]/g, "") || "guest";
  const base = cleaned.slice(0, 62);
  let id = `${base}-${suffix}`;
  if (id.length < 8) id = `${id}${"0".repeat(8 - id.length)}`;
  return id.slice(0, 64);
}

/** True when the API answered with an HTTP error (as opposed to a timeout or a network failure). */
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

/** Ends the session. An HTTP error is ignored (the page leaves the signed-in state either way); a timeout or lost connection throws. */
export async function logoutSession(): Promise<void> {
  try {
    await apiCall<unknown>("/auth/logout", { method: "POST" });
  } catch (e) {
    if (!isHttpError(e)) throw e;
  }
}

/** Start Google OAuth; `returnTo` must be an allowlisted duel-web origin. */
export function googleLoginUrl(returnTo: string = window.location.origin): string {
  // Base may be relative (`/api`); resolve against the page.
  const u = new URL(`${getApiBaseUrl()}/auth/google`, window.location.origin);
  u.searchParams.set("return_to", returnTo);
  return u.toString();
}

export type LeaderboardEntry = Schemas["DuelLeaderboardEntryOut"];

/** The top players by Bounty; players with no games are left out by the server. */
export async function fetchLeaderboard(limit = 5): Promise<LeaderboardEntry[]> {
  try {
    const body = await apiCall<Partial<Schemas["DuelLeaderboardOut"]> | null>(`/duel/leaderboard?limit=${limit}`);
    return body?.entries ?? [];
  } catch (e) {
    if (isHttpError(e)) return [];
    throw e;
  }
}

/** Your Bounty, record and rank (`rank` is null until you have a ranked game). */
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
};

/** GET /duel/rating/me; null when signed out or the call fails. */
export async function fetchRatingMe(): Promise<RatingMe | null> {
  try {
    return await apiCall<RatingMe>("/duel/rating/me");
  } catch (e) {
    if (isHttpError(e)) return null;
    throw e;
  }
}

export type LiveCounts = Schemas["DuelLiveOut"];

/** GET /duel/live (public): players online and matches in progress; null when the call fails. */
export async function fetchLive(): Promise<LiveCounts | null> {
  try {
    const j = await apiCall<Partial<LiveCounts> | null>("/duel/live");
    return typeof j?.online === "number" && typeof j.matches === "number" ? { online: j.online, matches: j.matches } : null;
  } catch (e) {
    if (isHttpError(e)) return null;
    throw e;
  }
}
