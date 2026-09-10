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

/** Cookie-free token mint (ENABLE_DEV_LOGIN or ENABLE_DUEL_DEV_TOKEN). */
export async function mintDevGameToken(userKey: string): Promise<DuelTokenResponse> {
  const res = await fetch(`${getApiBaseUrl()}/duel/dev-token`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ user_key: userKey }),
  });
  return readToken(res);
}

/** Stable-browser guest id → rated identity (always available). */
export async function mintGuestGameToken(guestId: string): Promise<DuelTokenResponse> {
  const res = await fetch(`${getApiBaseUrl()}/duel/guest-token`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ guest_id: guestId }),
  });
  return readToken(res);
}

/** Session-cookie token mint (Google / claimed login). */
export async function mintSessionGameToken(): Promise<DuelTokenResponse> {
  const res = await fetch(`${getApiBaseUrl()}/duel/token`, {
    method: "POST",
    credentials: "include",
  });
  return readToken(res);
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
