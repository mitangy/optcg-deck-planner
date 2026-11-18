import { SCOPE_PATTERN, SCOPE_TITLE_MAX } from "@optcg/analyst-contract";
export const GENERAL = "general";
export type ScopeKind = "general" | "match" | "deck";

export type LogPoseScope = { key: string; title: string };

export { SCOPE_TITLE_MAX };

export const isValidScope = (key: string): boolean => SCOPE_PATTERN.test(key);

export function scopeKind(key: string | null | undefined): ScopeKind {
  if (!key || !isValidScope(key)) return "general";
  return key.startsWith("match:") ? "match" : key.startsWith("deck:") ? "deck" : "general";
}

export const matchScope = (id: string): string | null => (isValidScope(`match:${id}`) ? `match:${id}` : null);
export const plannerDeckScope = (id: number | string): string | null => (isValidScope(`deck:planner:${id}`) ? `deck:planner:${id}` : null);
export const duelDeckScope = (id: string): string | null => (isValidScope(`deck:duel:${id}`) ? `deck:duel:${id}` : null);

const clean = (title: string): string => title.replace(/\s+/g, " ").trim().slice(0, SCOPE_TITLE_MAX);

export function pageScope(key: string | null, title: string): LogPoseScope | undefined {
  return key && key !== GENERAL && isValidScope(key) ? { key, title: clean(title) } : undefined;
}

export const GENERAL_SCOPE: LogPoseScope = { key: GENERAL, title: "General" };

export function scopeLabel(scope: LogPoseScope): string {
  const kind = scopeKind(scope.key);
  if (kind === "general") return "General";
  const title = scope.title || (kind === "deck" ? "this deck" : "this game");
  return `${kind === "deck" ? "Deck" : "Match"}: ${title}`;
}

export const canStartNewChat = (key: string): boolean => scopeKind(key) !== "match";

export type ThreadRow = { id: number; title: string; updated_at: string; scope: string };

export type ThreadGroup = { id: "here" | "match" | "deck" | "general"; label: string; threads: ThreadRow[] };

// `here` is fetched on its own, so a busy account doesn't push those chats out of the recent 50.
export function groupThreads(here: ThreadRow[], recent: ThreadRow[], activeKey: string): ThreadGroup[] {
  const seen = new Set(here.map((t) => t.id));
  const rest = recent.filter((t) => !seen.has(t.id));
  const newest = (a: ThreadRow, b: ThreadRow) => Date.parse(b.updated_at) - Date.parse(a.updated_at) || b.id - a.id;
  const of = (kind: ScopeKind) => rest.filter((t) => scopeKind(t.scope) === kind).sort(newest);
  const groups: ThreadGroup[] = [
    { id: "here", label: activeKey === GENERAL ? "General" : "This page", threads: [...here].sort(newest) },
    { id: "match", label: "Matches", threads: of("match") },
    { id: "deck", label: "Decks", threads: of("deck") },
    ...(activeKey === GENERAL ? [] : [{ id: "general" as const, label: "General", threads: of("general") }]),
  ];
  // On the general page its own chats are the first group; the rest of general would repeat it.
  return groups.filter((g) => g.threads.length > 0);
}
