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

export type AdminOverview = {
  generated_at: string;
  accounts: { total: number; real: number; guests: number; staff: number; banned: number; new_7d: number; new_30d: number };
  signups_by_day: SignupDay[];
  active: { d1: number; d7: number; d30: number; real_d7: number; real_d30: number };
  matches_by_day: MatchDay[];
  matches: { total: number; last_7d: number; ranked_7d: number; avg_turns_30d: number | null };
  top_leaders_30d: { leader_id: string; games: number; wins: number }[];
  planner: { decks: number; users_with_decks: number };
  log_pose: { questions_month: number; spend_month_usd: number; users_with_access: number };
};

export type EvalGroups = Record<string, { correct: number; total: number }>;

export type EvalRun = {
  run_at: string;
  label: string;
  model: string;
  correct: number;
  total: number;
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
  evals: EvalRun[];
};

export type ProviderResult<T> = { configured: false } | { configured: true; error: string } | ({ configured: true; error?: undefined } & T);

export type VercelData = {
  projects: { name: string; framework: string | null; latest: { state: string; created_at: string; url: string | null; commit: string | null } | null; deploys_7d: number }[];
};
export type RenderData = {
  services: { name: string; type: string; suspended: string | boolean; url: string | null; latest: { status: string; finished_at: string | null; commit: string | null } | null }[];
};
export type GithubData = {
  repo: { stars: number; open_issues: number };
  open_prs: number;
  commits_7d: number;
  main_ci: { name: string; conclusion: string | null; created_at: string; html_url: string }[];
  bot_selfplay: { name: string; conclusion: string | null; created_at: string; html_url: string }[];
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
export const fetchAdminOverview = () => call<AdminOverview>("/admin/overview");
export const fetchAdminBots = () => call<AdminBots>("/admin/bots");
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
