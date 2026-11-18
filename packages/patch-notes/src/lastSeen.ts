import { latestNoteDate, noteKey, notesFor, unseenNotes, type AppName } from "./helpers";
import type { PatchNote } from "./types";

export type NotesStorage = Pick<Storage, "getItem" | "setItem">;

const DATE = /^\d{4}-\d{2}-\d{2}$/;

export function lastSeenKey(app: AppName): string {
  return `optcg.patchNotes.lastSeen.${app}`;
}

function defaultStorage(): NotesStorage | null {
  try {
    return typeof localStorage === "undefined" ? null : localStorage;
  } catch {
    return null;
  }
}

export function readLastSeen(app: AppName, storage: NotesStorage | null = defaultStorage()): string | null {
  try {
    const value = storage?.getItem(lastSeenKey(app));
    return value && DATE.test(value) ? value : null;
  } catch {
    return null;
  }
}

export function seenKeysKey(app: AppName): string {
  return `optcg.patchNotes.seenOnLastDay.${app}`;
}

export function readSeenOnLastDay(app: AppName, storage: NotesStorage | null = defaultStorage()): string[] | null {
  try {
    const lastSeen = readLastSeen(app, storage);
    const raw = storage?.getItem(seenKeysKey(app));
    if (lastSeen === null || !raw) return null;
    const parsed = JSON.parse(raw) as { date?: unknown; keys?: unknown };
    if (parsed.date !== lastSeen || !Array.isArray(parsed.keys)) return null;
    return parsed.keys.filter((k): k is string => typeof k === "string");
  } catch {
    return null;
  }
}

// Records which notes of the newest day were shown, so a note added later the same day is still announced.
export function markAllSeen(app: AppName, storage: NotesStorage | null = defaultStorage(), notes: readonly PatchNote[]): void {
  try {
    const latest = latestNoteDate(app, notes);
    if (!latest) return;
    markSeen(app, latest, storage);
    if (readLastSeen(app, storage) !== latest) return;
    const keys = new Set(readSeenOnLastDay(app, storage) ?? []);
    for (const n of notesFor(app, notes)) if (n.date === latest) keys.add(noteKey(n));
    storage?.setItem(seenKeysKey(app), JSON.stringify({ date: latest, keys: [...keys] }));
  } catch {
    // Private mode or blocked storage: the card just comes back next visit.
  }
}

export function markSeen(app: AppName, date: string, storage: NotesStorage | null = defaultStorage()): void {
  try {
    const current = readLastSeen(app, storage);
    if (current !== null && current >= date) return;
    storage?.setItem(lastSeenKey(app), date);
  } catch {
    // Private mode or blocked storage: the card just comes back next visit.
  }
}

// With nothing recorded yet it records the newest date and announces nothing, so the NEXT update is the first one shown.
export function loadUnseen(
  app: AppName,
  storage: NotesStorage | null = defaultStorage(),
  notes: readonly PatchNote[],
): PatchNote[] {
  const lastSeen = readLastSeen(app, storage);
  if (lastSeen === null) {
    markAllSeen(app, storage, notes);
    return [];
  }
  return unseenNotes(app, lastSeen, notes, readSeenOnLastDay(app, storage));
}
