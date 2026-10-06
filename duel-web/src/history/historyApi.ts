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
  has_log?: boolean;
  /** False for a game that never sent a result; its log runs to the last saved turn. */
  finished?: boolean;
};

/** One seat's log of a finished game (`SeatLog` in @optcg/rules); events are already projected for that seat. */
export type SeatLogJson = {
  schema: number;
  seat: 0 | 1;
  openingHand: string[];
  /** The opponent's hand after mulligans; only in logs of games that can no longer be played. */
  opponentOpeningHand?: string[];
  turns: { turn: number; activeSeat: 0 | 1; events: unknown[]; hand?: string[]; opponentHandCount?: number; opponentHand?: string[] }[];
  boardCards: [string, string, 0 | 1][];
  diverged?: string;
};

export type MatchDetail = { match: MatchHistoryEntry; log: SeatLogJson | null };

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

export function fetchMatchDetail(matchId: string): Promise<MatchDetail> {
  return call<MatchDetail>(`/duel/matches/me/${encodeURIComponent(matchId)}`, {}, "Could not load this match");
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

export type AnalystLessonStatus = "draft" | "approved" | "rejected";
export type AnalystLesson = {
  id: number;
  status: AnalystLessonStatus;
  text: string;
  leader_id: string | null;
  opponent_id: string | null;
  cards: string[];
  match_ids: string[];
  created_at: string | null;
  reviewed_at: string | null;
};

/** Whether your games count toward Log Pose matchup stats (on unless you turn it off). */
export async function fetchAnalystSharing(): Promise<boolean> {
  return (await call<{ share_matches: boolean }>("/analyst/sharing", {}, "Could not load your stats setting")).share_matches;
}

export async function setAnalystSharing(share: boolean): Promise<boolean> {
  const body = await call<{ share_matches: boolean }>(
    "/analyst/sharing",
    { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ share_matches: share }) },
    "Could not save your stats setting",
  );
  return body.share_matches;
}

/** Lessons Claude drafted from your games, newest first. */
export async function fetchAnalystLessons(): Promise<AnalystLesson[]> {
  return (await call<{ lessons: AnalystLesson[] }>("/analyst/lessons/review", {}, "Could not load lessons")).lessons;
}

export function reviewAnalystLesson(id: number, status: AnalystLessonStatus): Promise<AnalystLesson> {
  return call<AnalystLesson>(
    `/analyst/lessons/review/${id}`,
    { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ status }) },
    "Could not save the lesson",
  );
}

export function deleteAnalystLesson(id: number): Promise<void> {
  return call<void>(`/analyst/lessons/review/${id}`, { method: "DELETE" }, "Could not delete the lesson");
}
