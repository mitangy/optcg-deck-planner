/** Mint a cookie-free game token when backend ENABLE_DEV_LOGIN is on. */
import { getApiBaseUrl } from "../config";

export type DuelTokenResponse = {
  token: string;
  expires_at: number;
  user_id: number;
  email: string;
  rating: number;
  games_played: number;
};

export async function mintDevGameToken(userKey: string): Promise<DuelTokenResponse> {
  const res = await fetch(`${getApiBaseUrl()}/duel/dev-token`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ user_key: userKey }),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Token mint failed (${res.status}): ${text.slice(0, 160)}`);
  }
  return (await res.json()) as DuelTokenResponse;
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
