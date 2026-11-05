/** What a Log Pose chat is about: the general chat, one match, or one deck. Mirrors the server's scope strings. */
export const GENERAL = "general";
export type ScopeKind = "general" | "match" | "deck";

/** A scope plus the name shown for it ("Zoro Aggro", "Luffy vs Zoro"). */
export type LogPoseScope = { key: string; title: string };

/** Must equal the server's limit on `scope_title`. */
export const SCOPE_TITLE_MAX = 80;

const SCOPE_RE = /^(?:general|match:[A-Za-z0-9_-]{1,64}|deck:planner:\d{1,12}|deck:duel:[A-Za-z0-9_-]{1,64})$/;

export const isValidScope = (key: string): boolean => SCOPE_RE.test(key);

/** The scope kind of a key; anything the server wouldn't accept counts as general. */
export function scopeKind(key: string | null | undefined): ScopeKind {
  if (!key || !isValidScope(key)) return "general";
  return key.startsWith("match:") ? "match" : key.startsWith("deck:") ? "deck" : "general";
}

/** `match:<id>`, or null when the id isn't one the server takes. */
export const matchScope = (id: string): string | null => (isValidScope(`match:${id}`) ? `match:${id}` : null);
/** `deck:planner:<id>` for a saved planner deck. */
export const plannerDeckScope = (id: number | string): string | null => (isValidScope(`deck:planner:${id}`) ? `deck:planner:${id}` : null);
/** `deck:duel:<id>` for a duel deck. */
export const duelDeckScope = (id: string): string | null => (isValidScope(`deck:duel:${id}`) ? `deck:duel:${id}` : null);

const clean = (title: string): string => title.replace(/\s+/g, " ").trim().slice(0, SCOPE_TITLE_MAX);

/** A scope for a page, or undefined (the general chat) when the key is missing or not valid. */
export function pageScope(key: string | null, title: string): LogPoseScope | undefined {
  return key && key !== GENERAL && isValidScope(key) ? { key, title: clean(title) } : undefined;
}

export const GENERAL_SCOPE: LogPoseScope = { key: GENERAL, title: "General" };

/** The chat's name in the panel header: "General", "Deck: Zoro Aggro", "Match: Luffy vs Zoro". */
export function scopeLabel(scope: LogPoseScope): string {
  const kind = scopeKind(scope.key);
  if (kind === "general") return "General";
  const title = scope.title || (kind === "deck" ? "this deck" : "this game");
  return `${kind === "deck" ? "Deck" : "Match"}: ${title}`;
}

/** Match chats are one per match, so only deck and general chats can start another. */
export const canStartNewChat = (key: string): boolean => scopeKind(key) !== "match";

/** A saved chat as the server lists it. */
export type ThreadRow = { id: number; title: string; updated_at: string; scope: string };

export type ThreadGroup = { id: "here" | "match" | "deck" | "general"; label: string; threads: ThreadRow[] };

/**
 * The Chats list: this page's chats first, then the rest by kind (Matches, Decks, General), each newest first.
 * `here` are the chats of the page's scope (fetched on their own, so a busy account doesn't push them out of the
 * recent 50); `recent` is the mixed list. Empty groups are left out.
 */
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
