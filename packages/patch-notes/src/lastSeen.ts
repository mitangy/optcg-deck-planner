import { latestNoteDate, noteKey, notesFor, unseenNotes, type AppName } from "./helpers";
import { PATCH_NOTES } from "./notes";
import type { PatchNote } from "./types";

/** The slice of Storage we use, so tests can pass a plain object. */
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

/** The newest note date this browser has been shown, or null when none was ever recorded (or storage is unavailable). */
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

/** The note keys recorded as seen on the last-seen day, or null when none were recorded (a date stored by an older version). */
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

/**
 * Records every note `app` has as seen: the newest day, and which notes of that
 * day were shown, so a note added later the same day is still announced.
 * Never moves backwards.
 */
export function markAllSeen(app: AppName, storage: NotesStorage | null = defaultStorage(), notes: readonly PatchNote[] = PATCH_NOTES): void {
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

/** Records `date` as seen. Never moves backwards. */
export function markSeen(app: AppName, date: string, storage: NotesStorage | null = defaultStorage()): void {
  try {
    const current = readLastSeen(app, storage);
    if (current !== null && current >= date) return;
    storage?.setItem(lastSeenKey(app), date);
  } catch {
    // Private mode or blocked storage: the card just comes back next visit.
  }
}

/**
 * The notes to announce on this launch. With nothing recorded yet it quietly
 * records the newest date and announces nothing, so the NEXT update is the
 * first one shown.
 */
export function loadUnseen(
  app: AppName,
  storage: NotesStorage | null = defaultStorage(),
  notes: readonly PatchNote[] = PATCH_NOTES,
): PatchNote[] {
  const lastSeen = readLastSeen(app, storage);
  if (lastSeen === null) {
    markAllSeen(app, storage, notes);
    return [];
  }
  return unseenNotes(app, lastSeen, notes, readSeenOnLastDay(app, storage));
}
