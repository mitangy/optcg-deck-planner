import type { AdminUser, EvalGroups, EvalRun, EvalSuite, FeedbackItem, Role } from "./adminApi";

export type AdminTab = "players" | "bots" | "hosting" | "users";

export const ADMIN_TABS: readonly { id: AdminTab; label: string }[] = [
  { id: "players", label: "Players" },
  { id: "bots", label: "Bots & Log Pose" },
  { id: "hosting", label: "Hosting" },
  { id: "users", label: "Users" },
];

/** The admin tabs a role may open: the admin sees all four, a moderator only Users, anyone else none. */
export function tabsForRole(role: Role | undefined | null): readonly { id: AdminTab; label: string }[] {
  if (role === "admin") return ADMIN_TABS;
  if (role === "moderator") return ADMIN_TABS.filter((t) => t.id === "users");
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
