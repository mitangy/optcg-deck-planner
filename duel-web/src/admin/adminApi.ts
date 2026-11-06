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

export type SignupSource = { ref?: string; land?: string; utm_source?: string; utm_medium?: string; utm_campaign?: string };

export type AdminUser = {
  id: number;
  email: string;
  name: string;
  username: string | null;
  role: Role;
  created_at: string;
  banned_at: string | null;
  ban_reason: string | null;
  /** First-touch source captured at sign-up (#905). Null: unknown (account predates tracking); `{}`: direct. */
  signup_source: SignupSource | null;
  /** Ranked + friends + private games (bot and practice are in `games` only). */
  matches: number;
  last_match_at: string | null;
  /** Games per mode (#988). */
  games: GameCounts;
};

export type GameMode = "ranked" | "friends" | "private" | "bot" | "practice";
export type GameCounts = Record<GameMode, number>;

export type AdminUserDetail = {
  user: AdminUser;
  last_seen_at: string | null;
  last_seen: { lobby: string | null; match: string | null; solo: string | null; log_pose: string | null };
  online: { now: boolean; room_role: "player" | "spectator" | null; ranked: boolean | null };
  rating: { rating: number; ranked_games: number } | null;
  modes: { mode: GameMode; games: number; wins: number }[];
  /** When the first bot / practice game of any account was saved; null while none has been. */
  solo_tracked_since: string | null;
  top_leaders: LeaderCount[];
  recent_matches: AdminUserMatch[];
  planner: { decks: number; owned_cards: number; owned_unique: number };
  duel: { saved_decks: number; uploads: number; uploads_taken_down: number; friends: number; friend_requests_pending: number };
  log_pose: {
    access: "pending" | "approved" | "denied" | null;
    questions_total: number;
    questions_month: number;
    spend_total_usd: number;
    spend_month_usd: number;
    last_used_at: string | null;
    threads: number;
  };
  moderation: { reports_against: number; reports_open: number; reports_filed: number; warnings: number; banned_by: { id: number; name: string } | null };
};

export type AdminUserMatch = {
  /** Match id (opens /replay/:id when `replay`), or the solo game key. */
  id: string;
  created_at: string;
  mode: GameMode;
  leader_id: string | null;
  opponent_leader_id: string | null;
  /** Null for bot and practice. */
  opponent: { id: number; name: string } | null;
  bot_level: string | null;
  won: boolean | null;
  turns: number | null;
  reason: string;
  replay: boolean;
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

export const fetchAdminUser = (id: number) => call<AdminUserDetail>(`/admin/users/${id}`);

export const setUserRole = (id: number, role: "user" | "moderator") =>
  call<AdminUser>(`/admin/users/${id}/role`, { method: "PUT", body: JSON.stringify({ role }) });
export const banUser = (id: number, reason: string) =>
  call<AdminUser>(`/admin/users/${id}/ban`, { method: "POST", body: JSON.stringify({ reason: reason.trim().slice(0, 200) || undefined }) });
export const unbanUser = (id: number) => call<AdminUser>(`/admin/users/${id}/unban`, { method: "POST" });
export const deleteUser = (id: number) => call<void>(`/admin/users/${id}`, { method: "DELETE" });

/** Advisory cheat-review flags (#809). They never change eligibility. */
export type EventFlag = "new_account" | "new_opponents" | "isolated_group" | "private_only";
export type EventParticipant = { user_id: number; name: string; email: string; games: number; opponents: number; eligible: boolean; excluded: "guest" | "banned" | "staff" | null; flags: EventFlag[] };
export type EventDrawee = { user_id: number; name: string; email: string; forfeited: boolean };
export type EventDrawState = {
  seed_hash: string;
  committed_at: string | null;
  drawn_at: string | null;
  /** Null until the draw runs. */
  seed: string | null;
  forfeited: number[];
  ranking: EventDrawee[];
  winners: EventDrawee[];
};
export type EventFormat = "casual" | "single_elim" | "round_robin" | "swiss";
export type EventPrizeMethod = "draw" | "placement";
export type EventStatus = "upcoming" | "live" | "ended" | "drawn";
/** What an admin sets on an event (#1019). Dates are ISO strings in UTC. */
export type EventFields = {
  title: string;
  description: string;
  starts_at: string;
  ends_at: string;
  format: EventFormat;
  /** Only for single elimination, otherwise null. */
  bracket_size: number | null;
  best_of: 1 | 3;
  prize: string;
  prize_details: string;
  prize_method: EventPrizeMethod;
  winners: number;
  min_games: number;
  min_opponents: number;
  min_turns: number;
};
export type AdminEventSummary = {
  id: string;
  title: string;
  starts_at: string;
  ends_at: string;
  status: EventStatus;
  format: EventFormat;
  prize: string;
  joined: number;
};
export type AdminEvent = EventFields & {
  id: string;
  status: EventStatus;
  rules_version: string;
  winners_count: number;
  counters: { opted_in: number; games_in_window: number; players_with_game: number; eligible: number; flagged_eligible: number };
  participants: EventParticipant[];
  draw: EventDrawState | null;
};

/** Every event, newest start first (#1019). */
export const fetchAdminEvents = () => call<{ events: AdminEventSummary[] }>("/admin/events").then((r) => r.events);
export const fetchAdminEvent = (id: string) => call<AdminEvent>(`/admin/events/${encodeURIComponent(id)}`);
export const createAdminEvent = (fields: EventFields) => call<AdminEvent>("/admin/events", { method: "POST", body: JSON.stringify(fields) });
export const updateAdminEvent = (id: string, fields: Partial<EventFields>) =>
  call<AdminEvent>(`/admin/events/${encodeURIComponent(id)}`, { method: "PATCH", body: JSON.stringify(fields) });
export const deleteAdminEvent = (id: string) => call<{ deleted: string }>(`/admin/events/${encodeURIComponent(id)}`, { method: "DELETE" });
/** The newest event whatever the date (the banner's /current stops after a week, but forfeits come later). */
export const fetchLatestAdminEvent = () => call<AdminEvent>("/admin/events/latest");
export const commitEventSeed = (id: string) => call<AdminEvent>(`/admin/events/${encodeURIComponent(id)}/commit`, { method: "POST" });
export const drawEvent = (id: string) => call<AdminEvent>(`/admin/events/${encodeURIComponent(id)}/draw`, { method: "POST" });
export const forfeitEventWinner = (id: string, userId: number) =>
  call<AdminEvent>(`/admin/events/${encodeURIComponent(id)}/forfeit`, { method: "POST", body: JSON.stringify({ user_id: userId }) });
export const eventCsvUrl = (id: string) => `${getApiBaseUrl()}/admin/events/${encodeURIComponent(id)}/participants.csv`;

// ---------------------------------------------------------------- player reports

export type ReportStatus = "open" | "dismissed" | "actioned";

export type ReportRow = {
  id: number;
  created_at: string;
  status: ReportStatus;
  action: string;
  staff_note: string;
  handled_by_name: string | null;
  handled_at: string | null;
  reason: "conduct" | "toxic" | "image";
  image_kind: "playmat" | "cardBack" | null;
  note: string;
  match_id: string;
  source: string;
  /** The saved match exists, so /replay/:id opens. */
  match_finished: boolean;
  has_image: boolean;
  cosmetic_id: number | null;
  image_taken_down: boolean;
  reporter: { id: number; name: string } | null;
  reported: { id: number; name: string; role: Role; banned: boolean; open_reports: number; total_reports: number; warnings: number };
};

export const fetchAdminReports = (status: "open" | "all") =>
  call<{ reports: ReportRow[] }>(`/admin/reports?status=${status}`).then((r) => r.reports);
export const dismissReport = (id: number, note = "") =>
  call<ReportRow>(`/admin/reports/${id}/dismiss`, { method: "POST", body: JSON.stringify({ note: note.trim() || undefined }) });
export const removeReportImage = (id: number, note = "") =>
  call<ReportRow>(`/admin/reports/${id}/remove-image`, { method: "POST", body: JSON.stringify({ note: note.trim() || undefined }) });
export const warnReport = (id: number, message: string) =>
  call<ReportRow>(`/admin/reports/${id}/warn`, { method: "POST", body: JSON.stringify({ message: message.trim().slice(0, 300) }) });
export const banReport = (id: number, reason: string) =>
  call<ReportRow>(`/admin/reports/${id}/ban`, { method: "POST", body: JSON.stringify({ reason: reason.trim().slice(0, 200) || undefined }) });

/** The reported image as a blob URL (the snapshot needs the staff cookie, so an <img src> cannot fetch it). Revoke it when done. */
export async function fetchReportImageUrl(id: number): Promise<string> {
  const res = await fetch(`${getApiBaseUrl()}/admin/reports/${id}/image`, { credentials: "include" });
  if (!res.ok) throw await apiError(res, `Could not load the image (${res.status})`);
  return URL.createObjectURL(await res.blob());
}

// ---------------------------------------------------------------- uploaded images (#812)

export type UploadState = "live" | "taken_down" | "all";
export type UploadKind = "playmat" | "cardBack";

export type UploadRow = {
  id: number;
  kind: UploadKind;
  mime: string;
  size: number;
  created_at: string;
  /** The owner has it switched on as their playmat / card back. */
  in_use: boolean;
  report_count: number;
  taken_down_at: string | null;
  taken_down_by_name: string | null;
  taken_down_reason: string | null;
  owner: { id: number; name: string; role: Role; banned: boolean };
};

export type UploadsPage = { total: number; items: UploadRow[] };

export const fetchAdminUploads = (state: UploadState, kind: UploadKind | null, offset: number, limit: number, beforeId?: number) =>
  call<UploadsPage>(`/admin/cosmetics?state=${state}${kind ? `&kind=${kind}` : ""}&limit=${limit}&offset=${offset}${beforeId === undefined ? "" : `&before_id=${beforeId}`}`);
export const takeDownUpload = (id: number, reason: string) =>
  call<UploadRow>(`/admin/cosmetics/${id}/take-down`, { method: "POST", body: JSON.stringify({ reason: reason.trim().slice(0, 200) }) });
export const restoreUpload = (id: number) => call<UploadRow>(`/admin/cosmetics/${id}/restore`, { method: "POST" });

/** An upload as a blob URL (the bytes need the staff cookie, so an <img src> cannot fetch them). Revoke it when done. */
export async function fetchUploadImageUrl(id: number): Promise<string> {
  const res = await fetch(`${getApiBaseUrl()}/admin/cosmetics/${id}/image`, { credentials: "include" });
  if (!res.ok) throw await apiError(res, `Could not load the image (${res.status})`);
  return URL.createObjectURL(await res.blob());
}
