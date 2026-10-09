import { PATCH_NOTES } from "./notes";
import type { PatchNote } from "./types";

export type AppName = "duel" | "planner";

/** Notes that apply to `app` (its own and the shared ones), newest day first; same-day notes keep their order in notes.ts. */
export function notesFor(app: AppName, notes: readonly PatchNote[] = PATCH_NOTES): PatchNote[] {
  return notes
    .filter((n) => n.app === app || n.app === "both")
    .map((n, i) => ({ n, i }))
    .sort((a, b) => (a.n.date < b.n.date ? 1 : a.n.date > b.n.date ? -1 : a.i - b.i))
    .map(({ n }) => n);
}

/** Newest date among `app`'s notes, or null when it has none. */
export function latestNoteDate(app: AppName, notes: readonly PatchNote[] = PATCH_NOTES): string | null {
  return notesFor(app, notes)[0]?.date ?? null;
}

/**
 * Notes strictly newer than `lastSeen`. A null `lastSeen` (a brand-new visitor,
 * or the first run after this shipped) gets none: the backlog is never dumped
 * on someone who hasn't seen the app change yet.
 */
export function unseenNotes(app: AppName, lastSeen: string | null, notes: readonly PatchNote[] = PATCH_NOTES): PatchNote[] {
  if (lastSeen === null) return [];
  return notesFor(app, notes).filter((n) => n.date > lastSeen);
}

/** Splits newest-first notes into one group per day, keeping their order. */
export function groupByDate(notes: readonly PatchNote[]): { date: string; notes: PatchNote[] }[] {
  const groups: { date: string; notes: PatchNote[] }[] = [];
  for (const note of notes) {
    const last = groups[groups.length - 1];
    if (last && last.date === note.date) last.notes.push(note);
    else groups.push({ date: note.date, notes: [note] });
  }
  return groups;
}
