import type { AdminUser, EvalGroups, EvalRun, Role } from "./adminApi";

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
export function evalVerdict(evals: readonly EvalRun[], firstGameAt: string | null): Verdict {
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
