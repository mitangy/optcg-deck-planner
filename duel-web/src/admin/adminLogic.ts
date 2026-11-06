import type { AdminEvent, AdminEventSummary, EventFields, EventFormat, EventPrizeMethod, SignupSource, UploadRow, AdminUser, EventFlag, EventParticipant, ReportRow, EvalGroups, EvalRun, EvalSuite, FeedbackItem, Role, GameCounts, GameMode, AdminUserDetail, AdminUserMatch } from "./adminApi";

export type AdminTab = "players" | "bots" | "traffic" | "hosting" | "event" | "reports" | "uploads" | "users";

export const ADMIN_TABS: readonly { id: AdminTab; label: string }[] = [
  { id: "players", label: "Players" },
  { id: "bots", label: "Bots & Log Pose" },
  { id: "traffic", label: "Traffic" },
  { id: "hosting", label: "Hosting" },
  { id: "event", label: "Events" },
  { id: "reports", label: "Reports" },
  { id: "uploads", label: "Uploads" },
  { id: "users", label: "Users" },
];

/** The admin tabs a role may open: the admin sees all eight, a moderator Reports, Uploads then Users, anyone else none. */
export function tabsForRole(role: Role | undefined | null): readonly { id: AdminTab; label: string }[] {
  if (role === "admin") return ADMIN_TABS;
  if (role === "moderator") return ADMIN_TABS.filter((t) => t.id === "reports" || t.id === "uploads" || t.id === "users");
  return [];
}

export function isStaff(role: Role | undefined | null): boolean {
  return role === "admin" || role === "moderator";
}

/** Mirrors the server's ban rule so the button is hidden when the call would be refused. Moderators ban plain users only. */
export function canBanUser(actor: { id: number; role: Role }, target: Pick<AdminUser, "id" | "role">): boolean {
  if (actor.id === target.id || target.role === "admin") return false;
  if (actor.role === "admin") return true;
  return actor.role === "moderator" && target.role === "user";
}

/**
 * How a new account found us, for the Users tab (#905). `text` is the short label; `title` adds the landing path.
 * A null source is an account from before tracking ("—"); an empty one is a direct visit.
 */
export function formatSignupSource(src: SignupSource | null | undefined): { text: string; title: string } {
  if (!src) return { text: "—", title: "Source unknown (signed up before tracking)" };
  const utm = [src.utm_source, src.utm_medium, src.utm_campaign].filter(Boolean).join(" / ");
  const text = utm ? `utm: ${utm}` : src.ref || "direct";
  const parts = [src.ref && utm ? `from ${src.ref}` : "", src.land ? `landed on ${src.land}` : ""].filter(Boolean);
  return { text, title: parts.length ? `${text} (${parts.join(", ")})` : text };
}

/** Only the admin deletes, and never themselves. */
export function canDeleteUser(actor: { id: number; role: Role }, target: Pick<AdminUser, "id" | "role">): boolean {
  return actor.role === "admin" && actor.id !== target.id && target.role !== "admin";
}

/** The score as a share of 100, or null for a run that has none. */
export function scorePct(e: Pick<EvalRun, "correct" | "total">): number | null {
  return e.correct != null && e.total != null && e.total > 0 ? (e.correct / e.total) * 100 : null;
}

/** "87.0%"; a dash when nothing was scored. */
export function percent(correct: number, total: number): string {
  if (total <= 0) return "—";
  return `${((correct / total) * 100).toFixed(1)}%`;
}

/** UTC calendar date of an ISO timestamp, "2026-10-19". */
export function dateOf(iso: string): string {
  return iso.slice(0, 10);
}

export type GroupDelta = { group: string; before: string; after: string; points: number };

export type Verdict =
  | { kind: "no-bot-games"; text: string }
  | { kind: "no-eval-since"; text: string }
  | { kind: "no-baseline"; text: string }
  | { kind: "compared"; text: string; points: number; before: EvalRun; after: EvalRun; groups: GroupDelta[] };

function signed(n: number): string {
  const r = Math.round(n * 10) / 10;
  return `${r > 0 ? "+" : ""}${r.toFixed(1)}`;
}

function groupDeltas(before: EvalGroups, after: EvalGroups): GroupDelta[] {
  const out: GroupDelta[] = [];
  for (const g of Object.keys(after).sort()) {
    const b = before[g];
    const a = after[g]!;
    if (!b || b.total <= 0 || a.total <= 0) continue;
    out.push({ group: g, before: percent(b.correct, b.total), after: percent(a.correct, a.total), points: (a.correct / a.total - b.correct / b.total) * 100 });
  }
  return out;
}

/**
 * Did Log Pose get more accurate once bot games started feeding it? Compares the latest eval run from
 * before the first bot game with the latest one after it (`evals` oldest first).
 */
export function evalVerdict(allRuns: readonly EvalRun[], firstGameAt: string | null): Verdict {
  // Bot games were meant to help the main Log Pose eval; the other suites measure other things.
  const evals = allRuns.filter((e) => (e.suite ?? "main") === "main" && scorePct(e) !== null) as (EvalRun & { correct: number; total: number })[];
  if (!firstGameAt) return { kind: "no-bot-games", text: "No bot games have been recorded yet." };
  const start = Date.parse(firstGameAt);
  const since = (e: EvalRun) => Date.parse(e.run_at) >= start;
  const after = [...evals].reverse().find(since);
  if (!after) return { kind: "no-eval-since", text: `No eval since bot games started on ${dateOf(firstGameAt)}; run one to compare.` };
  const before = [...evals].reverse().find((e) => !since(e));
  if (!before) return { kind: "no-baseline", text: `No eval from before bot games started on ${dateOf(firstGameAt)} to compare against.` };
  const points = (after.correct / after.total - before.correct / before.total) * 100;
  const word = Math.abs(points) < 0.05 ? "unchanged" : points > 0 ? "improved" : "dropped";
  const text = `Log Pose accuracy ${word}: ${percent(before.correct, before.total)} before bot games, ${percent(after.correct, after.total)} after (${signed(points)} points).`;
  return { kind: "compared", text, points, before, after, groups: groupDeltas(before.groups, after.groups) };
}

// ---------------------------------------------------------------- eval suites (#679)

export type SuiteInfo = { id: EvalSuite; label: string; blurb: string };

export const SUITES: readonly SuiteInfo[] = [
  { id: "main", label: "Log Pose eval", blurb: "50 questions on rulings, interactions, legality and matchups." },
  { id: "review_facts", label: "Review facts", blurb: "Facts in post-game reviews, checked against the replay." },
  { id: "puzzles", label: "Rules puzzles", blurb: "Positions with one right play." },
  { id: "deck_advice", label: "Deck advice", blurb: "Deck building advice, graded against reference decks." },
];

/** The runs split by suite, in the order of SUITES, oldest run first inside each; suites with no run are left out. */
export function groupBySuite(evals: readonly EvalRun[]): { suite: SuiteInfo; runs: EvalRun[] }[] {
  const out: { suite: SuiteInfo; runs: EvalRun[] }[] = [];
  for (const suite of SUITES) {
    const runs = evals.filter((e) => (e.suite ?? "main") === suite.id).sort((a, b) => Date.parse(a.run_at) - Date.parse(b.run_at));
    if (runs.length) out.push({ suite, runs });
  }
  return out;
}

export type Headline = { value: number; kind: "metric" | "pct"; name: string; text: string; lowerIsBetter: boolean };

/** What a run is judged by: its metric when it has one, else its score as a percentage. Null when it has neither. */
export function headlineOf(e: EvalRun): Headline | null {
  if (e.metric_name && e.metric_value != null) {
    return { value: e.metric_value, kind: "metric", name: e.metric_name, text: String(Math.round(e.metric_value * 100) / 100), lowerIsBetter: e.lower_is_better };
  }
  const pct = scorePct(e);
  return pct === null ? null : { value: pct, kind: "pct", name: "Score", text: `${pct.toFixed(1)}%`, lowerIsBetter: false };
}

export type Direction = "first" | "better" | "worse" | "same";
export type Change = { direction: Direction; text: string };

/** Smaller moves than this are noise in the shown figure (a tenth of a point of score, 0.005 of a metric). */
const SAME_WITHIN = { pct: 0.05, metric: 0.005 };

function signed2(n: number): string {
  const r = Math.round(n * 100) / 100;
  return `${r > 0 ? "+" : ""}${r.toFixed(2)}`;
}

/** How a run compares with the one before it. A lower metric is better when the suite says lower is better. */
export function changeFrom(prev: EvalRun | null, cur: EvalRun): Change {
  const now = headlineOf(cur);
  const before = prev ? headlineOf(prev) : null;
  if (!now || !before || before.kind !== now.kind) return { direction: "first", text: "First run" };
  const diff = now.value - before.value;
  if (Math.abs(diff) < SAME_WITHIN[now.kind]) return { direction: "same", text: "Same" };
  const better = now.lowerIsBetter ? diff < 0 : diff > 0;
  const size = now.kind === "pct" ? `${signed(diff)} pts` : signed2(diff);
  return { direction: better ? "better" : "worse", text: `${better ? "Better" : "Worse"} ${size}` };
}

/** Each run with its change from the previous one, oldest first. */
export function withChanges(runs: readonly EvalRun[]): { run: EvalRun; change: Change }[] {
  return runs.map((run, i) => ({ run, change: changeFrom(i > 0 ? runs[i - 1]! : null, run) }));
}

/** One line for the top of a suite: the latest figure and whether it got better or worse than the run before. */
export function suiteSummary(runs: readonly EvalRun[]): string {
  const last = runs[runs.length - 1];
  const h = last ? headlineOf(last) : null;
  if (!last || !h) return "";
  const change = changeFrom(runs.length > 1 ? runs[runs.length - 2]! : null, last);
  const lead = `${h.name}: ${h.text}${h.lowerIsBetter ? " (lower is better)" : ""}`;
  if (change.direction === "first") return lead;
  return `${lead}. ${change.direction === "same" ? "Same as the run before" : `${change.text} than the run before`}`;
}

/** Y axis for a suite's chart: a score zooms to the data in 10-point steps; a metric starts at 0 and tops out on a round number. */
export function chartScale(values: readonly number[], kind: "metric" | "pct"): { min: number; max: number } {
  if (kind === "pct") {
    const floor = Math.min(...values);
    return { min: Math.max(0, Math.floor((floor - 5) / 10) * 10), max: 100 };
  }
  const top = Math.max(...values) * 1.1;
  if (!(top > 0)) return { min: 0, max: 1 };
  const pow = 10 ** Math.floor(Math.log10(top));
  const n = top / pow;
  return { min: 0, max: (n <= 1 ? 1 : n <= 2 ? 2 : n <= 5 ? 5 : 10) * pow };
}

// ---------------------------------------------------------------- Log Pose feedback (#679)

export const RATING_LABEL = { up: "Good", down: "Not helpful", wrong: "Wrong" } as const;

/** Where to read the game a review rating is about; chat answers have no page of their own. */
export function feedbackMatchPath(item: Pick<FeedbackItem, "kind" | "match_id">): string | null {
  return item.kind === "review" && item.match_id ? `/history/${encodeURIComponent(item.match_id)}` : null;
}

// ---------------------------------------------------------------- interactive charts and tables (#691)

/** The windows the date range picker offers; the API accepts exactly these. */
export const RANGE_OPTIONS = [7, 14, 30, 90] as const;
export type RangeDays = (typeof RANGE_OPTIONS)[number];

export type ChartSeries = { key: string; label: string };
export type ChartValues = Record<string, number[]>;

/** Per-day totals of the series that are shown. */
export function visibleTotals(count: number, series: readonly ChartSeries[], values: ChartValues, hidden: ReadonlySet<string>): number[] {
  const shown = series.filter((s) => !hidden.has(s.key));
  return Array.from({ length: count }, (_, i) => shown.reduce((sum, s) => sum + (values[s.key]?.[i] ?? 0), 0));
}

/** Top of the Y axis: the tallest visible day, at least 1 so an empty chart still has a scale. */
export function visibleMax(totals: readonly number[]): number {
  return Math.max(1, ...totals);
}

/** Hide or show one series. The last visible series cannot be hidden. */
export function toggleSeries(hidden: ReadonlySet<string>, key: string, allKeys: readonly string[]): Set<string> {
  const next = new Set(hidden);
  if (next.has(key)) {
    next.delete(key);
    return next;
  }
  const stillShown = allKeys.filter((k) => k !== key && !next.has(k));
  if (stillShown.length === 0) return next;
  next.add(key);
  return next;
}

/** "Mon, Oct 19" for an ISO day, read as a UTC date. */
export function dayLabel(iso: string): string {
  const t = Date.parse(`${iso.slice(0, 10)}T00:00:00Z`);
  if (Number.isNaN(t)) return iso;
  return new Date(t).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric", timeZone: "UTC" });
}

export type TooltipData = { title: string; rows: { key: string; label: string; value: number }[]; total: number };

/** What the tooltip of one day says: its date, each visible series' count and their total. */
export function tooltipFor(day: string, index: number, series: readonly (ChartSeries & { color?: string })[], values: ChartValues, hidden: ReadonlySet<string>): TooltipData {
  const rows = series.filter((s) => !hidden.has(s.key)).map((s) => ({ key: s.key, label: s.label, value: values[s.key]?.[index] ?? 0 }));
  return { title: dayLabel(day), rows, total: rows.reduce((sum, r) => sum + r.value, 0) };
}

/** The same as one line, for the native title and screen readers: "2026-10-19: 4 ranked, 2 casual (6 total)". */
export function tooltipText(day: string, tip: TooltipData): string {
  const parts = tip.rows.map((r) => `${r.value} ${r.label.toLowerCase()}`).join(", ");
  return tip.rows.length > 1 ? `${day}: ${parts} (${tip.total} total)` : `${day}: ${parts}`;
}

export type TipPlacement = { h: "left" | "center" | "right"; v: "above" | "below" };

/**
 * Where a tooltip sits against its anchor so it stays inside the chart: left-aligned near the left edge,
 * right-aligned near the right edge, centred between. `yPct` (0 bottom, 100 top) puts it below a high anchor.
 */
export function tipPlacement(xPct: number, yPct = 0): TipPlacement {
  return { h: xPct < 28 ? "left" : xPct > 72 ? "right" : "center", v: yPct > 55 ? "below" : "above" };
}

export type SortDir = "asc" | "desc";
export type SortState<K extends string> = { key: K; dir: SortDir };

/** Click on a header: the same column flips direction, a new one starts in `firstDir`. */
export function nextSort<K extends string>(cur: SortState<K>, key: K, firstDir: SortDir = "desc"): SortState<K> {
  return cur.key === key ? { key, dir: cur.dir === "asc" ? "desc" : "asc" } : { key, dir: firstDir };
}

export function ariaSort<K extends string>(cur: SortState<K>, key: K): "ascending" | "descending" | "none" {
  return cur.key !== key ? "none" : cur.dir === "asc" ? "ascending" : "descending";
}

export type LeaderRow = { leader_id: string; name: string; games: number; wins: number };
export type LeaderSortKey = "name" | "games" | "wins" | "rate";

/** Win rate as a fraction; a leader with no games sorts as 0. */
export function winRate(l: Pick<LeaderRow, "games" | "wins">): number {
  return l.games > 0 ? l.wins / l.games : 0;
}

/** A sorted copy. Ties fall back to most games, then name, so equal rows never swap places between renders. */
export function sortLeaders(rows: readonly LeaderRow[], sort: SortState<LeaderSortKey>): LeaderRow[] {
  const sign = sort.dir === "asc" ? 1 : -1;
  const primary = (a: LeaderRow, b: LeaderRow): number => {
    if (sort.key === "name") return a.name.localeCompare(b.name);
    if (sort.key === "games") return a.games - b.games;
    if (sort.key === "wins") return a.wins - b.wins;
    return winRate(a) - winRate(b);
  };
  return [...rows].sort((a, b) => sign * primary(a, b) || b.games - a.games || a.name.localeCompare(b.name) || a.leader_id.localeCompare(b.leader_id));
}

export type RunSortKey = "date" | "score" | "spend";

/** A sorted copy of the run rows. Runs without the figure go last either way; the rows keep the change they were given. */
export function sortRunRows<T extends { run: EvalRun }>(rows: readonly T[], sort: SortState<RunSortKey>): T[] {
  const sign = sort.dir === "asc" ? 1 : -1;
  const figure = (r: EvalRun): number | null =>
    sort.key === "date" ? Date.parse(r.run_at) : sort.key === "score" ? (headlineOf(r)?.value ?? null) : (r.spend_usd ?? null);
  return [...rows].sort((a, b) => {
    const x = figure(a.run);
    const y = figure(b.run);
    if (x === null || y === null) return x === y ? 0 : x === null ? 1 : -1;
    return sign * (x - y) || Date.parse(a.run.run_at) - Date.parse(b.run.run_at);
  });
}

/**
 * The runs as table rows in the order asked for. Each row's change is worked out against the run before it in time
 * first, and sorting only moves the rows, so "vs previous" never means "the row above".
 */
export function sortedRunRows(runs: readonly EvalRun[], sort: SortState<RunSortKey>): { run: EvalRun; change: Change }[] {
  return sortRunRows(withChanges(runs), sort);
}

/** The id of a run's table row, so a dot on the chart can find it. */
export function runRowId(suite: string, run: Pick<EvalRun, "run_at" | "label">): string {
  return `adm-run-${suite}-${Date.parse(run.run_at)}-${run.label.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`;
}

/** "$0.42", or a dash for a run with no recorded spend. */
export function spendText(usd: number | null | undefined): string {
  return usd == null ? "—" : `$${usd.toFixed(2)}`;
}

/** A link a hosting row may open: http(s) only, with https:// added to a bare host ("app.vercel.app"). Null when there is none. */
export function externalUrl(raw: string | null | undefined): string | null {
  const v = (raw ?? "").trim();
  if (!v) return null;
  const full = /^[a-z][a-z0-9+.-]*:/i.test(v) ? v : `https://${v.replace(/^\/+/, "")}`;
  return /^https?:\/\//i.test(full) ? full : null;
}

/** "14:05" (UTC) for a match's start. */
export function timeOf(iso: string): string {
  return iso.slice(11, 16);
}

/** Short label and tooltip for each advisory giveaway flag (#809). */
export const EVENT_FLAG_INFO: Record<EventFlag, { label: string; title: string }> = {
  new_account: { label: "New account", title: "Account made in the 7 days before the event" },
  new_opponents: { label: "New opponents", title: "Every counted opponent has an account made in the 7 days before the event" },
  isolated_group: { label: "Small closed group", title: "Counted games only link this player to a group of 4 accounts or fewer" },
  private_only: { label: "Private games only", title: "None of the counted games were ranked-queue games" },
};

export function eventFlagInfo(flag: string): { label: string; title: string } {
  return EVENT_FLAG_INFO[flag as EventFlag] ?? { label: flag, title: flag };
}

export type ParticipantSortKey = "name" | "email" | "games" | "opponents" | "eligible" | "flags";

/** Sorts the giveaway participants. Ties fall back to eligible first, then most games, then name, so the order is stable. */
export function sortParticipants(rows: readonly EventParticipant[], sort: SortState<ParticipantSortKey>): EventParticipant[] {
  const dirSign = sort.dir === "asc" ? 1 : -1;
  const primary = (a: EventParticipant, b: EventParticipant): number => {
    if (sort.key === "name") return a.name.localeCompare(b.name);
    if (sort.key === "email") return a.email.localeCompare(b.email);
    if (sort.key === "games") return a.games - b.games;
    if (sort.key === "opponents") return a.opponents - b.opponents;
    if (sort.key === "flags") return a.flags.length - b.flags.length;
    return Number(a.eligible) - Number(b.eligible);
  };
  return [...rows].sort((a, b) => dirSign * primary(a, b) || Number(b.eligible) - Number(a.eligible) || b.games - a.games || a.name.localeCompare(b.name) || a.user_id - b.user_id);
}

/** The draw button is offered once the event has ended, a seed was committed, and nothing was drawn yet. */
export function canDrawEvent(event: { status: string; draw: { drawn_at: string | null } | null }): boolean {
  return event.status === "ended" && event.draw !== null && event.draw.drawn_at === null;
}

/** The seed can be committed only while the event is upcoming and none exists. */
export function canCommitSeed(event: { status: string; draw: unknown | null }): boolean {
  return event.status === "upcoming" && event.draw === null;
}

// ---------------------------------------------------------------- events (#1019)

export const EVENT_FORMAT_OPTIONS: readonly { value: EventFormat; label: string }[] = [
  { value: "casual", label: "Casual play" },
  { value: "single_elim", label: "Single-elimination bracket" },
  { value: "round_robin", label: "Round robin" },
  { value: "swiss", label: "Swiss" },
];
export const EVENT_PRIZE_METHOD_OPTIONS: readonly { value: EventPrizeMethod; label: string }[] = [
  { value: "draw", label: "Random draw among eligible players" },
  { value: "placement", label: "Top finishers" },
];
export const EVENT_BRACKET_SIZES = [4, 8, 16, 32] as const;

/** The event the tab opens on: the live one, else the soonest upcoming, else the newest. The list is newest start first. */
export function defaultEventId(events: readonly Pick<AdminEventSummary, "id" | "status" | "starts_at">[]): string | null {
  const live = events.find((e) => e.status === "live");
  if (live) return live.id;
  const upcoming = events.filter((e) => e.status === "upcoming").sort((a, b) => Date.parse(a.starts_at) - Date.parse(b.starts_at));
  return upcoming[0]?.id ?? events[0]?.id ?? null;
}

/** "2026-11-22T12:00" for a datetime-local input, in the admin's own time zone. */
export function toLocalInput(iso: string): string {
  const d = new Date(iso);
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
}

/** The UTC ISO time for a datetime-local value read in the admin's own time zone, or null when it is empty or not a date. */
export function fromLocalInput(value: string): string | null {
  if (!value) return null;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

/** "EST", "PDT": the zone the datetime-local fields are read in, for their labels. */
export function zoneAbbr(iso: string, locale?: string): string {
  return new Intl.DateTimeFormat(locale, { timeZoneName: "short" }).formatToParts(new Date(iso)).find((p) => p.type === "timeZoneName")?.value ?? "";
}

/** The form's values as typed: dates are datetime-local strings and numbers are strings, so a half-typed field is allowed. */
export type EventForm = {
  title: string;
  description: string;
  startsAt: string;
  endsAt: string;
  format: EventFormat;
  bracketSize: number;
  bestOf: 1 | 3;
  prize: string;
  prizeDetails: string;
  prizeMethod: EventPrizeMethod;
  winners: string;
  minGames: string;
  minOpponents: string;
  minTurns: string;
};

/** A new event: a week out at noon for three hours, with the same requirements the first event used. */
export function newEventForm(now: Date): EventForm {
  const start = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 7, 12, 0);
  const end = new Date(start.getTime() + 3 * 3_600_000);
  return {
    title: "",
    description: "",
    startsAt: toLocalInput(start.toISOString()),
    endsAt: toLocalInput(end.toISOString()),
    format: "casual",
    bracketSize: 8,
    bestOf: 1,
    prize: "",
    prizeDetails: "",
    prizeMethod: "draw",
    winners: "3",
    minGames: "3",
    minOpponents: "2",
    minTurns: "3",
  };
}

export function eventToForm(e: AdminEvent): EventForm {
  return {
    title: e.title,
    description: e.description,
    startsAt: toLocalInput(e.starts_at),
    endsAt: toLocalInput(e.ends_at),
    format: e.format,
    bracketSize: e.bracket_size ?? 8,
    bestOf: e.best_of,
    prize: e.prize,
    prizeDetails: e.prize_details,
    prizeMethod: e.prize_method,
    winners: String(e.winners),
    minGames: String(e.min_games),
    minOpponents: String(e.min_opponents),
    minTurns: String(e.min_turns),
  };
}

const wholeNumber = (v: string): number | null => (/^\d+$/.test(v.trim()) ? Number(v.trim()) : null);

/** The API payload for the form, or the first thing wrong with it. Mirrors the server's checks so most mistakes show before saving. */
export function eventFormPayload(f: EventForm): { ok: true; fields: EventFields } | { ok: false; error: string } {
  const title = f.title.trim();
  if (title.length < 1 || title.length > 80) return { ok: false, error: "Give the event a title of 1 to 80 characters." };
  const starts = fromLocalInput(f.startsAt);
  const ends = fromLocalInput(f.endsAt);
  if (!starts || !ends) return { ok: false, error: "Pick a start and an end time." };
  if (Date.parse(ends) <= Date.parse(starts)) return { ok: false, error: "The end must be after the start." };
  if (f.prize.trim().length > 200) return { ok: false, error: "The prize summary can be at most 200 characters." };
  const winners = wholeNumber(f.winners);
  if (winners === null || winners < 1 || winners > 50) return { ok: false, error: "Winners must be a whole number from 1 to 50." };
  const minGames = wholeNumber(f.minGames);
  const minOpponents = wholeNumber(f.minOpponents);
  const minTurns = wholeNumber(f.minTurns);
  if (minGames === null || minOpponents === null || minTurns === null) return { ok: false, error: "Minimum games, opponents and turns must be whole numbers, 0 or more." };
  return {
    ok: true,
    fields: {
      title,
      description: f.description.trim(),
      starts_at: starts,
      ends_at: ends,
      format: f.format,
      bracket_size: f.format === "single_elim" ? f.bracketSize : null,
      best_of: f.bestOf,
      prize: f.prize.trim(),
      prize_details: f.prizeDetails.trim(),
      prize_method: f.prizeMethod,
      winners,
      min_games: minGames,
      min_opponents: minOpponents,
      min_turns: minTurns,
    },
  };
}

export type EventLockKey = "starts_at" | "ends_at" | "winners" | "min_games" | "min_opponents" | "min_turns" | "prize_method";

/** Fields the server will not change any more, with why. Mirrors its rules: the draw fixes who was eligible; a committed seed fixes the method and, once started, the start. */
export function eventLocks(event: Pick<AdminEvent, "status" | "draw">): { fields: ReadonlySet<EventLockKey>; reason: string | null } {
  const fields = new Set<EventLockKey>();
  if (event.draw?.drawn_at) {
    for (const k of ["starts_at", "ends_at", "winners", "min_games", "min_opponents", "min_turns", "prize_method"] as const) fields.add(k);
    return { fields, reason: "The draw already ran, so the dates, winners, minimums and prize method are locked." };
  }
  if (event.draw) {
    fields.add("prize_method");
    if (event.status !== "upcoming") fields.add("starts_at");
    return { fields, reason: "A seed is committed, so the prize method is locked" + (fields.has("starts_at") ? " and the start can't move." : ".") };
  }
  return { fields, reason: null };
}

/** The edit request: every field except the locked ones, which are left out so a round trip through the form cannot look like a change. */
export function eventEditBody(fields: EventFields, locked: ReadonlySet<EventLockKey>): Partial<EventFields> {
  return Object.fromEntries(Object.entries(fields).filter(([k]) => !locked.has(k as EventLockKey))) as Partial<EventFields>;
}

/** An event can be deleted until its draw has run. */
export function canDeleteEvent(event: Pick<AdminEvent, "draw">): boolean {
  return !event.draw?.drawn_at;
}

/** Seed and draw only exist for events that pick winners by draw. */
export function eventUsesDraw(event: Pick<AdminEvent, "prize_method">): boolean {
  return event.prize_method === "draw";
}

// ---------------------------------------------------------------- player reports

export const DEFAULT_WARNING = "Please follow the Rules of conduct.";

/** Why Warn and Ban are off for this report's player, or null when the actor may act. Mirrors the server's ban rule. */
export function reportActionBlock(actor: { id: number; role: Role }, reported: Pick<ReportRow["reported"], "id" | "role">): string | null {
  if (canBanUser(actor, reported)) return null;
  if (actor.id === reported.id) return "You cannot act on your own account.";
  if (reported.role === "admin") return "Admin accounts cannot be warned or banned.";
  return "Only an admin can act on staff accounts.";
}

/** "2026-10-29 14:03", UTC. */
export function stampOf(iso: string): string {
  return iso.slice(0, 16).replace("T", " ");
}

const ACTION_WORDS: Record<string, string> = { image_removed: "Image removed", warned: "Warned", banned: "Banned" };

/** The line under a handled report: what was done, by whom, when. Null while it is open. */
export function handledLine(r: Pick<ReportRow, "status" | "action" | "handled_by_name" | "handled_at">): string | null {
  if (r.status === "open") return null;
  const what = r.status === "dismissed" ? "Dismissed" : (ACTION_WORDS[r.action] ?? "Actioned");
  const who = r.handled_by_name ? ` by ${r.handled_by_name}` : "";
  const when = r.handled_at ? ` · ${stampOf(r.handled_at)}` : "";
  return `${what}${who}${when}`;
}

export const REPORT_REASON_LABELS: Record<string, string> = {
  conduct: "Rules of conduct",
  toxic: "Toxic or abusive",
  image: "Inappropriate image",
};

export const REPORT_SOURCE_LABELS: Record<string, string> = {
  match: "In a match",
  spectate: "Spectating",
  postmatch: "After a match",
  history: "From match history",
  friends: "Friends list",
};

// ---------------------------------------------------------------- uploaded images (#812)

export const TAKE_DOWN_CHOICES = ["Copyright notice", "Explicit", "Hateful", "Other"] as const;
export type TakeDownChoice = (typeof TAKE_DOWN_CHOICES)[number];
const TAKE_DOWN_MAX = 200;

/** The reason sent with a take-down: the choice, then the note after a colon. "Other" has to say what; null while it does not. */
export function takeDownReason(choice: TakeDownChoice, note: string): string | null {
  const extra = note.trim();
  if (choice === "Other") return extra ? extra.slice(0, TAKE_DOWN_MAX) : null;
  return (extra ? `${choice}: ${extra}` : choice).slice(0, TAKE_DOWN_MAX);
}

/** "812 B", "48 KB", "1.4 MB". */
export function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${Math.round(n / 1024)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

// ---------------------------------------------------------------- traffic tab (#1020)

/** Memory sizes the way Render shows them: "207 MB", "1.5 GB". */
export function memoryText(bytes: number | null | undefined): string {
  if (bytes == null) return "—";
  const mb = bytes / (1024 * 1024);
  if (mb >= 1024) return `${(mb / 1024).toFixed(1)} GB`;
  return `${Math.round(mb)} MB`;
}

/** A value next to its limit: "207 MB · 40% of 512 MB". Without a limit, just the value. */
export function againstLimit(value: number | null | undefined, limit: number | null | undefined, show: (n: number) => string): string {
  if (value == null) return "—";
  if (!limit) return show(value);
  return `${show(value)} · ${Math.round((value / limit) * 100)}% of ${show(limit)}`;
}

/** CPU in cores: "0.006 cores", "0.25 cores". */
export function coresText(cores: number | null | undefined): string {
  if (cores == null) return "—";
  return `${cores >= 0.1 ? Number(cores.toFixed(2)) : Number(cores.toPrecision(2))} cores`;
}

/** An empty referrer is a visit that came straight to the site. */
export function referrerLabel(host: string): string {
  return host === "" ? "Direct" : host;
}

/** "US" as "United States"; the code itself when the browser cannot name it. */
export function countryName(code: string): string {
  if (!code) return "Unknown";
  try {
    return new Intl.DisplayNames(["en"], { type: "region" }).of(code.toUpperCase()) ?? code;
  } catch {
    return code;
  }
}

/** "mobile" as "Mobile". */
export function deviceLabel(kind: string): string {
  return kind ? kind.charAt(0).toUpperCase() + kind.slice(1) : "Unknown";
}

/** Only the admin undoes a take-down; the server refuses a moderator. */
export function canRestoreUpload(actor: { role: Role }, row: Pick<UploadRow, "taken_down_at">): boolean {
  return actor.role === "admin" && row.taken_down_at !== null;
}

export function uploadKindLabel(kind: UploadRow["kind"]): string {
  return kind === "cardBack" ? "Card back" : "Playmat";
}

// ---------------------------------------------------------------- user detail (#988)

/** Game modes in the order every admin table shows them, with a short header for narrow columns. */
export const GAME_MODES: readonly { mode: GameMode; label: string; short: string; title: string }[] = [
  { mode: "ranked", label: "Ranked", short: "Rkd", title: "Ranked games (matchmaker queue)" },
  { mode: "friends", label: "Friends", short: "Frd", title: "Unranked games against an accepted friend" },
  { mode: "private", label: "Private", short: "Prv", title: "Unranked games in a private room against a non-friend" },
  { mode: "bot", label: "Bot", short: "Bot", title: "Games against the server bot (counted since tracking began)" },
  { mode: "practice", label: "Practice", short: "Prc", title: "Hotseat practice games (counted since tracking began)" },
];

export function modeLabel(mode: GameMode): string {
  return GAME_MODES.find((m) => m.mode === mode)?.label ?? mode;
}

/** Every game the account played, all five modes. */
export function totalGames(games: GameCounts): number {
  return GAME_MODES.reduce((sum, m) => sum + (games[m.mode] ?? 0), 0);
}

/** The line under "Games by mode": bot and practice games were not saved before tracking began. */
export function soloNote(trackedSince: string | null): string {
  if (!trackedSince) return "Bot and practice games are not tracked yet, so those counts stay 0 until the first one is saved.";
  return `Bot and practice games are counted since ${dateOf(trackedSince)}; earlier ones were not saved.`;
}

/** A game's result for the account: practice has no winner. */
export function resultOf(m: Pick<AdminUserMatch, "mode" | "won">): "Won" | "Lost" | "—" {
  if (m.mode === "practice" || m.won == null) return "—";
  return m.won ? "Won" : "Lost";
}

/** "5 min ago", "3 days ago"; past a month the date. `now` is injected for tests. */
export function agoText(iso: string, now: number = Date.now()): string {
  const secs = Math.max(0, Math.round((now - Date.parse(iso)) / 1000));
  if (secs < 60) return "just now";
  const mins = Math.floor(secs / 60);
  if (mins < 60) return `${mins} min ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours} h ago`;
  const days = Math.floor(hours / 24);
  if (days < 31) return `${days} ${days === 1 ? "day" : "days"} ago`;
  return dateOf(iso);
}

/** Where the account is right now, or null when offline. */
export function presenceText(online: AdminUserDetail["online"]): string | null {
  if (!online.now) return null;
  if (online.room_role === "player") return online.ranked ? "In a ranked game" : "In a game";
  if (online.room_role === "spectator") return "Watching a game";
  return "Online now";
}

/** "$1.25"; sub-cent spend keeps a third decimal so a few questions do not read as free. */
export function usd(v: number): string {
  if (v > 0 && v < 0.01) return `$${v.toFixed(3)}`;
  return `$${v.toFixed(2)}`;
}
