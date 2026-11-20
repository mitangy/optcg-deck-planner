import type { PatchNote, Topic } from "./types";

export type AppName = "duel" | "planner";

export function notesFor(app: AppName, notes: readonly PatchNote[]): PatchNote[] {
  return notes
    .filter((n) => n.app === app || n.app === "both")
    .map((n, i) => ({ n, i }))
    .sort((a, b) => (a.n.date < b.n.date ? 1 : a.n.date > b.n.date ? -1 : a.i - b.i))
    .map(({ n }) => n);
}

export function latestNoteDate(app: AppName, notes: readonly PatchNote[]): string | null {
  return notesFor(app, notes)[0]?.date ?? null;
}

export function noteKey(n: PatchNote): string {
  return n.pr !== undefined ? `pr${n.pr}` : `${n.date}|${n.title}`;
}

// A null `seenOnLastDay` is a date stored before keys existed: that whole day counts as seen. A null `lastSeen` (a new visitor) gets none: the backlog is never dumped on someone who has not seen the app change yet.
export function unseenNotes(
  app: AppName,
  lastSeen: string | null,
  notes: readonly PatchNote[],
  seenOnLastDay: readonly string[] | null = null,
): PatchNote[] {
  if (lastSeen === null) return [];
  return notesFor(app, notes).filter((n) => n.date > lastSeen || (n.date === lastSeen && seenOnLastDay !== null && !seenOnLastDay.includes(noteKey(n))));
}

export function groupByDate(notes: readonly PatchNote[]): { date: string; notes: PatchNote[] }[] {
  const groups: { date: string; notes: PatchNote[] }[] = [];
  for (const note of notes) {
    const last = groups[groups.length - 1];
    if (last && last.date === note.date) last.notes.push(note);
    else groups.push({ date: note.date, notes: [note] });
  }
  return groups;
}

export const TOPICS: readonly Topic[] = ["cards", "ranked", "phone", "shared"];

export const TOPIC_LABELS: Record<Topic, string> = {
  cards: "New cards",
  ranked: "Ranked & events",
  phone: "Phone",
  shared: "Duel + Planner",
};

const CARDS_TITLE = /\b(new|more)\b.*\b(cards?|alt arts?|promo)\b|alt art|promo/i;
const RANKED_WORDS = /\b(ranked|tournaments?|bount(y|ies)|leaderboards?|ratings?|events?|seasons?)\b/i;
const PHONE_WORDS = /\b(phones?|mobile|sideways|portrait|landscape|touch)\b/i;

// Worked out from the words unless the note names its topics itself.
export function noteTopics(note: PatchNote): Topic[] {
  if (note.topics) return [...note.topics];
  const words = `${note.title} ${note.text}`;
  const found: Topic[] = [];
  if (note.cards?.length || CARDS_TITLE.test(note.title)) found.push("cards");
  if (RANKED_WORDS.test(words)) found.push("ranked");
  if (PHONE_WORDS.test(words)) found.push("phone");
  if (note.app === "both") found.push("shared");
  return found;
}

export function matchesQuery(note: PatchNote, query: string): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  const hay = [note.title, note.text, ...(note.cards ?? []).flatMap((c) => [c.name, c.id])];
  return hay.some((h) => h.toLowerCase().includes(q));
}

function slug(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48)
    .replace(/-+$/g, "");
}

// Several notes share one pull request, so the title is part of the id.
export function noteAnchor(note: PatchNote): string {
  return `${note.pr !== undefined ? `pr${note.pr}` : note.date}-${slug(note.title)}`;
}

export function monthKey(date: string): string {
  return date.slice(0, 7);
}

const MONTH = new Intl.DateTimeFormat("en-US", { year: "numeric", month: "long", timeZone: "UTC" });

export function formatMonth(key: string): string {
  const d = new Date(`${key}-01T00:00:00Z`);
  return Number.isNaN(d.getTime()) ? key : MONTH.format(d);
}

export function addDays(date: string, days: number): string {
  const d = new Date(`${date}T00:00:00Z`);
  if (Number.isNaN(d.getTime())) return date;
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

export const INITIAL_DAYS = 14;
export const INITIAL_MIN_NOTES = 20;
export const OLDER_DAYS = 30;

type Group = { date: string; notes: readonly PatchNote[] };

// How many day groups (newest first) show at first: the newest 14 days, and at least 20 notes. Whole days only.
export function initialGroupCount(groups: readonly Group[]): number {
  if (groups.length === 0) return 0;
  const cutoff = addDays(groups[0].date, -INITIAL_DAYS);
  let n = 0;
  let notes = 0;
  while (n < groups.length && (groups[n].date >= cutoff || notes < INITIAL_MIN_NOTES)) notes += groups[n++].notes.length;
  return n;
}

// "Show older": the 30 days before the oldest day shown, always at least one more day.
export function olderGroupCount(groups: readonly Group[], shown: number): number {
  if (shown >= groups.length) return groups.length;
  if (shown === 0) return initialGroupCount(groups);
  const cutoff = addDays(groups[shown - 1].date, -OLDER_DAYS);
  let n = shown;
  while (n < groups.length && groups[n].date >= cutoff) n++;
  return Math.max(n, shown + 1);
}

// Enough day groups to include `date`.
export function groupCountThrough(groups: readonly Group[], date: string): number {
  const i = groups.findIndex((g) => g.date <= date);
  return i === -1 ? groups.length : i + 1;
}
