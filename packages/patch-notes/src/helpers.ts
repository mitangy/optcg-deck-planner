import type { PatchNote } from "./types";

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
