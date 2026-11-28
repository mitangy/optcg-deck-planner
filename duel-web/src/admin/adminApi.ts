import type { components } from "@optcg/api-client";
import { apiCall, apiError } from "../api/http";
import { getApiBaseUrl } from "../config";

type Schemas = components["schemas"];

export type Role = Schemas["AdminMe"]["role"];

export type AdminMe = Schemas["AdminMe"];

export type DayCount = { day: string };
export type SignupDay = Schemas["SignupDay"];
export type MatchDay = Schemas["MatchDay"];

export type LeaderCount = Schemas["LeaderCount"];

export type AdminOverview = Schemas["AdminOverview"];

export type AdminFunnel = Schemas["AdminFunnel"];

export type DayMatchSeat = Schemas["DayMatchSeat"];
export type DayMatch = Schemas["DayMatch"];
export type AdminDayMatches = Schemas["AdminDayMatches"];

export type EvalGroups = Schemas["EvalRun"]["groups"];

export type EvalSuite = Schemas["EvalRun"]["suite"];

export type EvalRun = Schemas["EvalRun"];

export type AdminBots = Schemas["AdminBots"];

export type FeedbackRating = Schemas["FeedbackItem"]["rating"];

export type FeedbackItem = Schemas["FeedbackItem"];

export type AdminFeedback = Schemas["AdminFeedback"];

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

export type TrafficRow = { key: string; visitors: number; pageviews: number };
export type TrafficProject =
  | { name: string; error: string }
  | {
      name: string;
      error?: undefined;
      totals: { visitors: number; pageviews: number };
      daily: { date: string; visitors: number; pageviews: number }[];
      pages: TrafficRow[];
      referrers: TrafficRow[];
      countries: TrafficRow[];
      devices: TrafficRow[];
    };
export type TrafficService =
  | { name: string; error: string }
  | {
      name: string;
      error?: undefined;
      type: string;
      requests_daily: { date: string; total: number; errors_5xx: number }[];
      requests: number;
      errors_5xx: number;
      errors_4xx: number;
      cpu_avg: number | null;
      cpu_peak: number | null;
      cpu_limit: number | null;
      memory_avg: number | null;
      memory_peak: number | null;
      memory_limit: number | null;
    };
export type TrafficVercel = { fetched_at?: string; projects: TrafficProject[] };
export type TrafficRender = { fetched_at?: string; days: number; services: TrafficService[] };
export type AdminTraffic = { days: number; vercel: ProviderResult<TrafficVercel>; render: ProviderResult<TrafficRender> };

export type SignupSource = { ref?: string; land?: string; utm_source?: string; utm_medium?: string; utm_campaign?: string };

export type AdminUser = Omit<Schemas["AdminUser"], "signup_source"> & {
  signup_source: SignupSource | null;
};

export type GameMode = Schemas["AdminUserMatch"]["mode"];
export type GameCounts = Schemas["GameCounts"];

export type AdminUserDetail = Omit<Schemas["AdminUserDetail"], "user"> & { user: AdminUser };

export type AdminUserMatch = Schemas["AdminUserMatch"];

export type AdminUsers = { total: number; users: AdminUser[] };

export const call = apiCall;

export const fetchAdminMe = () => call<AdminMe>("/admin/me");
export const fetchAdminOverview = (days = 30) => call<AdminOverview>(`/admin/overview?days=${days}`);
export const fetchAdminFunnel = (days = 30) => call<AdminFunnel>(`/admin/funnel?days=${days}`);
export const fetchAdminBots = (days = 14) => call<AdminBots>(`/admin/bots?days=${days}`);
export const fetchAdminMatches = (day: string) => call<AdminDayMatches>(`/admin/matches?day=${encodeURIComponent(day)}`);
export function fetchAdminFeedback(rating: FeedbackRating | null, limit: number, offset: number): Promise<AdminFeedback> {
  const p = new URLSearchParams({ limit: String(limit), offset: String(offset) });
  if (rating) p.set("rating", rating);
  return call<AdminFeedback>(`/admin/feedback?${p}`);
}
export const fetchAdminTraffic = (days = 30, refresh = false) => call<AdminTraffic>(`/admin/traffic?days=${days}${refresh ? "&refresh=1" : ""}`);
export const fetchAdminHosting = (refresh = false) => call<AdminHosting>(`/admin/hosting${refresh ? "?refresh=1" : ""}`);

export function fetchAdminUsers(q: string, includeGuests: boolean, limit: number, offset: number, sort: { key: string; dir: "asc" | "desc" } | null = null): Promise<AdminUsers> {
  const p = new URLSearchParams({ include_guests: includeGuests ? "1" : "0", limit: String(limit), offset: String(offset) });
  if (q.trim()) p.set("q", q.trim());
  if (sort) {
    p.set("sort", sort.key);
    p.set("dir", sort.dir);
  }
  return call<AdminUsers>(`/admin/users?${p}`);
}

export const fetchAdminUser = (id: number) => call<AdminUserDetail>(`/admin/users/${id}`);

export const setUserRole = (id: number, role: "user" | "moderator") =>
  call<AdminUser>(`/admin/users/${id}/role`, { method: "PUT", body: JSON.stringify({ role }) });
export const banUser = (id: number, reason: string) =>
  call<AdminUser>(`/admin/users/${id}/ban`, { method: "POST", body: JSON.stringify({ reason: reason.trim().slice(0, 200) || undefined }) });
export const unbanUser = (id: number) => call<AdminUser>(`/admin/users/${id}/unban`, { method: "POST" });
export const deleteUser = (id: number) => call<void>(`/admin/users/${id}`, { method: "DELETE" });

export type EventFlag = Schemas["EventParticipant"]["flags"][number];
export type EventParticipant = Schemas["EventParticipant"];
export type EventDrawee = Schemas["EventDrawee"];
export type EventDrawState = Schemas["EventDrawState"];
export type EventFormat = Schemas["AdminEvent"]["format"];
export type EventPrizeMethod = Schemas["AdminEvent"]["prize_method"];
export type EventStatus = Schemas["AdminEvent"]["status"];
export type EventFields = {
  title: string;
  description: string;
  starts_at: string;
  ends_at: string;
  format: EventFormat;
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
export type AdminEventSummary = Schemas["AdminEventSummary"];
export type AdminEvent = Schemas["AdminEvent"];

export const fetchAdminEvents = () => call<{ events: AdminEventSummary[] }>("/admin/events").then((r) => r.events);
export const fetchAdminEvent = (id: string) => call<AdminEvent>(`/admin/events/${encodeURIComponent(id)}`);
export const createAdminEvent = (fields: EventFields) => call<AdminEvent>("/admin/events", { method: "POST", body: JSON.stringify(fields) });
export const updateAdminEvent = (id: string, fields: Partial<EventFields>) =>
  call<AdminEvent>(`/admin/events/${encodeURIComponent(id)}`, { method: "PATCH", body: JSON.stringify(fields) });
export const deleteAdminEvent = (id: string) => call<{ deleted: string }>(`/admin/events/${encodeURIComponent(id)}`, { method: "DELETE" });
export const fetchLatestAdminEvent = () => call<AdminEvent>("/admin/events/latest");
export const commitEventSeed = (id: string) => call<AdminEvent>(`/admin/events/${encodeURIComponent(id)}/commit`, { method: "POST" });
export const drawEvent = (id: string) => call<AdminEvent>(`/admin/events/${encodeURIComponent(id)}/draw`, { method: "POST" });
export const forfeitEventWinner = (id: string, userId: number) =>
  call<AdminEvent>(`/admin/events/${encodeURIComponent(id)}/forfeit`, { method: "POST", body: JSON.stringify({ user_id: userId }) });
export const eventCsvUrl = (id: string) => `${getApiBaseUrl()}/admin/events/${encodeURIComponent(id)}/participants.csv`;

export type ReportStatus = Schemas["ReportRow"]["status"];

export type ReportRow = Schemas["ReportRow"];

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

export type UploadState = "live" | "taken_down" | "all";
export type UploadKind = Schemas["UploadRow"]["kind"];

export type UploadRow = Schemas["UploadRow"];

export type UploadsPage = Schemas["UploadsPage"];

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

export type IgReel = Schemas["ReelOut"];
export type IgPost = Schemas["PostOut"];
export type IgReelsCheck = Schemas["ReelsCheckOut"];

export const fetchIgReels = () => call<Schemas["ReelsOut"]>("/admin/instagram/reels").then((r) => r.reels);
export const fetchIgPosts = () => call<Schemas["PostsOut"]>("/admin/instagram/posts?limit=30").then((r) => r.posts);
export const checkIgReels = () => call<IgReelsCheck>("/admin/instagram/reels/check");
export function uploadIgReel(file: File, title: string, caption: string) {
  const form = new FormData();
  form.set("file", file);
  form.set("title", title);
  form.set("caption", caption);
  // A 100 MB video on a slow connection needs more than the default budget.
  return call<IgReel>("/admin/instagram/reels", { method: "POST", body: form, timeoutMs: 600_000 });
}
export const updateIgReel = (id: number, patch: { title?: string; caption?: string; active?: boolean }) =>
  call<IgReel>(`/admin/instagram/reels/${id}`, { method: "PATCH", body: JSON.stringify(patch) });
export const deleteIgReel = (id: number) => call<unknown>(`/admin/instagram/reels/${id}`, { method: "DELETE" });

export type AdminSeasons = Schemas["AdminSeasons"];
export type AdminSeasonPreviewRow = Schemas["AdminSeasonPreviewRow"];
export type AdminSeasonPast = Schemas["AdminSeasonPast"];
export type SeasonResetMode = Schemas["AdminSeasonStartIn"]["mode"];

export const fetchAdminSeasons = () => call<AdminSeasons>("/admin/seasons");
export const startAdminSeason = (mode: SeasonResetMode, name: string, confirm: string) =>
  call<Schemas["AdminSeasonStarted"]>("/admin/seasons", {
    method: "POST",
    body: JSON.stringify({ mode, name: name.trim() || undefined, confirm }),
  });
