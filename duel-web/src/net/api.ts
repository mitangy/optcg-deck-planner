/** Duel-web ↔ FastAPI helpers (tokens + light auth). */
import { getApiBaseUrl } from "../config";

export type DuelTokenResponse = {
  token: string;
  expires_at: number;
  user_id: number;
  email: string;
  rating: number;
  games_played: number;
};

export type AuthUser = {
  id: number;
  email: string;
  name: string;
};

async function readToken(res: Response): Promise<DuelTokenResponse> {
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Token mint failed (${res.status}): ${text.slice(0, 160)}`);
  }
  return (await res.json()) as DuelTokenResponse;
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

/** True for transient failures worth retrying (cold start, race, rate limit). */
function isRetryableMintError(err: unknown): boolean {
  if (!(err instanceof Error)) return true;
  const msg = err.message;
  if (/Token mint failed \((429|503|502|504)\)/.test(msg)) return true;
  if (/Token mint failed \((4\d\d)\)/.test(msg)) return false;
  // Network / abort-from-timeout — retry (free-tier Render cold starts).
  return true;
}

async function fetchWithTimeout(
  url: string,
  init: RequestInit,
  timeoutMs: number,
): Promise<Response> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    return await fetch(url, {
      ...init,
      signal: init.signal ?? ctrl.signal,
    });
  } catch (e) {
    if (ctrl.signal.aborted && !(init.signal && init.signal.aborted)) {
      throw new Error(`Request timed out after ${Math.round(timeoutMs / 1000)}s`);
    }
    throw e;
  } finally {
    clearTimeout(timer);
  }
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
  const attempts = opts?.attempts ?? 3;
  const timeoutMs = opts?.timeoutMs ?? 20000;
  const label = opts?.label ?? "Token mint";
  let lastErr: unknown;
  for (let i = 0; i < attempts; i++) {
    if (i > 0) await sleep(400 * i);
    try {
      const res = await fetchWithTimeout(
        `${getApiBaseUrl()}${path}`,
        {
          method: "POST",
          headers: body ? { "Content-Type": "application/json" } : undefined,
          body: body ? JSON.stringify(body) : undefined,
          credentials: opts?.credentials,
        },
        timeoutMs,
      );
      return await readToken(res);
    } catch (e) {
      lastErr = e;
      if (!isRetryableMintError(e) || i === attempts - 1) {
        const detail = e instanceof Error ? e.message : String(e);
        throw new Error(`${label} failed: ${detail}`);
      }
    }
  }
  throw lastErr instanceof Error ? lastErr : new Error(String(lastErr));
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
 * Best-effort wake for free-tier Render services so the first hotseat mint /
 * Colyseus create is not the cold-start request.
 */
export function warmDuelServices(apiBase: string, gameServerUrl: string): void {
  const api = apiBase.replace(/\/$/, "");
  const gs = gameServerUrl.replace(/\/$/, "");
  void fetch(`${api}/health`).catch(() => undefined);
  void fetch(`${gs}/health`).catch(() => undefined);
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

export async function fetchAuthMe(): Promise<AuthUser | null> {
  const res = await fetch(`${getApiBaseUrl()}/auth/me`, { credentials: "include" });
  if (!res.ok) return null;
  const body = (await res.json()) as AuthUser | null;
  return body;
}

export async function claimLoginTicket(ticket: string): Promise<AuthUser> {
  const res = await fetch(`${getApiBaseUrl()}/auth/claim`, {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ ticket }),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Claim failed (${res.status}): ${text.slice(0, 160)}`);
  }
  return (await res.json()) as AuthUser;
}

export async function logoutSession(): Promise<void> {
  await fetch(`${getApiBaseUrl()}/auth/logout`, {
    method: "POST",
    credentials: "include",
  });
}

/** Start Google OAuth; `returnTo` must be an allowlisted duel-web origin. */
export function googleLoginUrl(returnTo: string = window.location.origin): string {
  const u = new URL(`${getApiBaseUrl()}/auth/google`);
  u.searchParams.set("return_to", returnTo);
  return u.toString();
}

export async function fetchLeaderboard(): Promise<
  { user_id: number; name: string; rating: number; games_played: number }[]
> {
  const res = await fetch(`${getApiBaseUrl()}/duel/leaderboard`);
  if (!res.ok) return [];
  const body = (await res.json()) as {
    entries: { user_id: number; name: string; rating: number; games_played: number }[];
  };
  return body.entries ?? [];
}
