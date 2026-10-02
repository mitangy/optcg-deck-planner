/** Duel-web ↔ FastAPI: your match history and your personal Log Pose connector link. */
import { getApiBaseUrl } from "../config";
import { ApiError } from "../net/api";

export type MatchHistoryEntry = {
  match_id: string;
  created_at: string | null;
  ranked: boolean;
  your_seat: number;
  won: boolean;
  reason: string;
  turns: number | null;
  your_leader_id: string | null;
  opponent_leader_id: string | null;
  opponent_name: string;
  rating_before: number;
  rating_after: number;
  has_replay: boolean;
};

export type AnalystLinkStatus = { has_token: boolean; created_at: string | null };
export type AnalystLinkCreated = { token: string; connector_url: string | null };

async function call<T>(path: string, init: RequestInit = {}, fallback = "Request failed"): Promise<T> {
  const res = await fetch(`${getApiBaseUrl()}${path}`, { credentials: "include", ...init });
  if (!res.ok) {
    let detail = `${fallback} (${res.status})`;
    try {
      const body = (await res.json()) as { detail?: unknown };
      if (typeof body.detail === "string" && body.detail) detail = body.detail;
    } catch {
      /* non-JSON body */
    }
    throw new ApiError(res.status, detail);
  }
  return (res.status === 204 ? undefined : await res.json()) as T;
}

export async function fetchMatchHistory(limit = 50): Promise<MatchHistoryEntry[]> {
  const body = await call<{ matches: MatchHistoryEntry[] }>(`/duel/matches/me?limit=${limit}`, {}, "Could not load your matches");
  return body.matches;
}

export function fetchAnalystLink(): Promise<AnalystLinkStatus> {
  return call<AnalystLinkStatus>("/analyst/token", {}, "Could not check your Log Pose link");
}

/** A new link; any earlier one stops working. */
export function createAnalystLink(): Promise<AnalystLinkCreated> {
  return call<AnalystLinkCreated>("/analyst/token", { method: "POST" }, "Could not make a link");
}

export function revokeAnalystLink(): Promise<void> {
  return call<void>("/analyst/token", { method: "DELETE" }, "Could not turn off the link");
}
