import { latestNoteDate, unseenNotes, type AppName } from "./helpers";
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
    const latest = latestNoteDate(app, notes);
    if (latest) markSeen(app, latest, storage);
    return [];
  }
  return unseenNotes(app, lastSeen, notes);
}
