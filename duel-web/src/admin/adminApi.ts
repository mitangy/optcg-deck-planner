import { apiError } from "../net/api";
import { getApiBaseUrl } from "../config";

export type Role = "user" | "moderator" | "admin";

export type AdminMe = {
  role: Role;
  can: { analytics: boolean; set_roles: boolean; ban: boolean; delete: boolean };
};

export type DayCount = { day: string };
export type SignupDay = DayCount & { real: number; guests: number };
export type MatchDay = DayCount & { ranked: number; casual: number };

export type LeaderCount = { leader_id: string; games: number; wins: number };

export type AdminOverview = {
  generated_at: string;
  /** The window of the day charts and `top_leaders`. */
  days: number;
  accounts: { total: number; real: number; guests: number; staff: number; banned: number; new_7d: number; new_30d: number };
  signups_by_day: SignupDay[];
  active: { d1: number; d7: number; d30: number; real_d7: number; real_d30: number };
  matches_by_day: MatchDay[];
  matches: { total: number; last_7d: number; ranked_7d: number; avg_turns_30d: number | null };
  /** The last `days` days, up to 25. */
  top_leaders: LeaderCount[];
  /** Kept for older clients: always the last 30 days. */
  top_leaders_30d: LeaderCount[];
  planner: { decks: number; users_with_decks: number };
  log_pose: { questions_month: number; spend_month_usd: number; users_with_access: number };
};

export type DayMatchSeat = { user_id: number; name: string | null; leader_id: string | null; won: boolean };
export type DayMatch = {
  /** The id the replay page takes: /replay/:id. */
  id: string;
  created_at: string | null;
  ranked: boolean;
  turns: number | null;
  winner_seat: number | null;
  seats: DayMatchSeat[];
};
export type AdminDayMatches = { day: string; matches: DayMatch[] };

export type EvalGroups = Record<string, { correct: number; total: number }>;

export type EvalSuite = "main" | "review_facts" | "puzzles" | "deck_advice";

export type EvalRun = {
  /** Which eval. Runs recorded before suites existed are "main". */
  suite: EvalSuite;
  run_at: string;
  label: string;
  model: string;
  /** The score, null for a run that only has a headline metric. */
  correct: number | null;
  total: number | null;
  /** The headline when a suite is not a score, e.g. "Wrong claims per review". */
  metric_name: string | null;
  metric_value: number | null;
  lower_is_better: boolean;
  groups: EvalGroups;
  spend_usd: number | null;
  notes: string;
};

export type AdminBots = {
  bot_games: {
    total: number;
    finished: number;
    unfinished: number;
    first_game_at: string | null;
    last_game_at: string | null;
    leaders: number;
    matchups: number;
    avg_turns: number | null;
    first_seat_win_rate: number | null;
    last_batch_id: string | null;
    by_day: { day: string; games: number; finished: number }[];
  };
  /** The window of `bot_games.by_day`. */
  days: number;
  evals: EvalRun[];
};

export type FeedbackRating = "up" | "down" | "wrong";

export type FeedbackItem = {
  id: number;
  created_at: string | null;
  updated_at: string | null;
  kind: "chat" | "review";
  rating: FeedbackRating;
  note: string;
  answer_excerpt: string;
  question: string;
  model: string;
  user_id: number;
  user_name: string | null;
  thread_id: number | null;
  message_index: number | null;
  match_id: string | null;
};

export type AdminFeedback = { days: number; counts: Record<FeedbackRating, number>; items: FeedbackItem[] };

export type ProviderResult<T> = { configured: false } | { configured: true; error: string } | ({ configured: true; error?: undefined } & T);

export type VercelData = {
  projects: { name: string; framework: string | null; latest: { state: string; created_at: string; url: string | null; commit: string | null } | null; deploys_7d: number }[];
};
export type RenderData = {
  services: { name: string; type: string; suspended: string | boolean; url: string | null; latest: { status: string; finished_at: string | null; commit: string | null } | null }[];
};
export type GithubData = {
  repo: string;
  stars: number | null;
  open_issues: number | null;
  open_prs: number;
  commits_7d: number;
  ci_runs: { name: string; conclusion: string | null; created_at: string; html_url: string }[];
  bot_runs: { name: string; conclusion: string | null; created_at: string; html_url: string }[];
  traffic_views: { count: number; uniques: number } | null;
};

export type AdminHosting = {
  vercel: ProviderResult<VercelData>;
  render: ProviderResult<RenderData>;
  github: ProviderResult<GithubData>;
};

export type AdminUser = {
  id: number;
  email: string;
  name: string;
  username: string | null;
  role: Role;
  created_at: string;
  banned_at: string | null;
  ban_reason: string | null;
  matches: number;
  last_match_at: string | null;
};

export type AdminUsers = { total: number; users: AdminUser[] };

async function call<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${getApiBaseUrl()}${path}`, {
    credentials: "include",
    ...init,
    headers: init?.body ? { "Content-Type": "application/json" } : undefined,
  });
  if (!res.ok) throw await apiError(res, `Request failed (${res.status})`);
  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}

export const fetchAdminMe = () => call<AdminMe>("/admin/me");
export const fetchAdminOverview = (days = 30) => call<AdminOverview>(`/admin/overview?days=${days}`);
export const fetchAdminBots = (days = 14) => call<AdminBots>(`/admin/bots?days=${days}`);
export const fetchAdminMatches = (day: string) => call<AdminDayMatches>(`/admin/matches?day=${encodeURIComponent(day)}`);
export function fetchAdminFeedback(rating: FeedbackRating | null, limit: number, offset: number): Promise<AdminFeedback> {
  const p = new URLSearchParams({ limit: String(limit), offset: String(offset) });
  if (rating) p.set("rating", rating);
  return call<AdminFeedback>(`/admin/feedback?${p}`);
}
export const fetchAdminHosting = (refresh = false) => call<AdminHosting>(`/admin/hosting${refresh ? "?refresh=1" : ""}`);

export function fetchAdminUsers(q: string, includeGuests: boolean, limit: number, offset: number): Promise<AdminUsers> {
  const p = new URLSearchParams({ include_guests: includeGuests ? "1" : "0", limit: String(limit), offset: String(offset) });
  if (q.trim()) p.set("q", q.trim());
  return call<AdminUsers>(`/admin/users?${p}`);
}

export const setUserRole = (id: number, role: "user" | "moderator") =>
  call<AdminUser>(`/admin/users/${id}/role`, { method: "PUT", body: JSON.stringify({ role }) });
export const banUser = (id: number, reason: string) =>
  call<AdminUser>(`/admin/users/${id}/ban`, { method: "POST", body: JSON.stringify({ reason: reason.trim().slice(0, 200) || undefined }) });
export const unbanUser = (id: number) => call<AdminUser>(`/admin/users/${id}/unban`, { method: "POST" });
export const deleteUser = (id: number) => call<void>(`/admin/users/${id}`, { method: "DELETE" });
