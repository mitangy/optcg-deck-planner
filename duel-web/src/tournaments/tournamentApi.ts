/** Duel-web ↔ FastAPI tournaments (single elimination and round robin among friends). */
import { apiCall } from "../api/http";
import type { TimerPreset } from "../home/timerPreset";

export type TournamentFormat = "single_elim" | "round_robin";
export type TournamentStatus = "open" | "running" | "finished" | "cancelled";
export type TournamentRole = "organizer" | "joined" | "invited";
export type MatchStatus = "waiting" | "ready" | "done";

export type Person = { user_id: number; username: string };

export type TournamentSummary = {
  id: number;
  code: string;
  name: string;
  format: TournamentFormat;
  size: number;
  status: TournamentStatus;
  players_joined: number;
  my_role: TournamentRole;
  my_match_ready: boolean;
};

export type TournamentPlayer = Person & { status: "invited" | "joined"; seed: number | null };

export type TournamentMatch = {
  id: number;
  round: number;
  slot: number;
  a: Person | null;
  b: Person | null;
  winner_id: number | null;
  status: MatchStatus;
  decided_by: "game" | "bye" | "walkover" | null;
  room_open: boolean;
  host_id: number | null;
  result_match_id: string | null;
};

export type StandingRow = Person & { wins: number; losses: number; played: number; rank: number };

export type Tournament = {
  id: number;
  code: string;
  name: string;
  format: TournamentFormat;
  size: number;
  timer: TimerPreset;
  status: TournamentStatus;
  created_at: string;
  started_at: string | null;
  finished_at: string | null;
  organizer: Person;
  winner: Person | null;
  players: TournamentPlayer[];
  matches: TournamentMatch[];
  /** Round robin only. */
  standings: StandingRow[];
  rounds: number;
  me: { user_id: number; role: TournamentRole | null; can_join: boolean; can_start: boolean };
};

export type CreateTournamentBody = {
  name: string;
  format: TournamentFormat;
  size: number;
  timer: TimerPreset;
};

export type PlayResult = {
  action: "join" | "host" | "wait" | "hosted";
  room_id?: string;
  server_url?: string | null;
};

export const call = apiCall;

const post = <T>(path: string, body?: unknown, fallback?: string) =>
  call<T>(path, { method: "POST", body: body === undefined ? undefined : JSON.stringify(body) }, fallback);

const base = (code: string) => `/tournaments/${encodeURIComponent(code)}`;

export async function fetchTournaments(): Promise<TournamentSummary[]> {
  const body = await call<{ tournaments: TournamentSummary[] }>("/tournaments", {}, "Could not load tournaments");
  return body.tournaments;
}

export function createTournament(body: CreateTournamentBody): Promise<Tournament> {
  return post<Tournament>("/tournaments", { ...body, name: body.name.trim() }, "Could not create the tournament");
}

export function fetchTournament(code: string): Promise<Tournament> {
  return call<Tournament>(base(code), {}, "Could not load the tournament");
}

export const joinTournament = (code: string) => post<Tournament>(`${base(code)}/join`, undefined, "Could not join");
export const leaveTournament = (code: string) => post<Tournament>(`${base(code)}/leave`, undefined, "Could not leave");
export const startTournament = (code: string) => post<Tournament>(`${base(code)}/start`, undefined, "Could not start");
export const cancelTournament = (code: string) => post<Tournament>(`${base(code)}/cancel`, undefined, "Could not cancel");

export const inviteToTournament = (code: string, userId: number) =>
  post<Tournament>(`${base(code)}/invite`, { user_id: userId }, "Could not send invite");

export function removeTournamentPlayer(code: string, userId: number): Promise<Tournament> {
  return call<Tournament>(`${base(code)}/players/${userId}`, { method: "DELETE" }, "Could not remove");
}

/** Claim the match room (no body), or report the room you just opened. */
export function playTournamentMatch(
  code: string,
  matchId: number,
  room?: { room_id: string; server_url?: string | null },
): Promise<PlayResult> {
  return post<PlayResult>(`${base(code)}/matches/${matchId}/play`, room ?? {}, "Could not start the match");
}

export const awardTournamentMatch = (code: string, matchId: number, winnerId: number) =>
  post<Tournament>(`${base(code)}/matches/${matchId}/award`, { winner_id: winnerId }, "Could not award the win");
