// Player-facing patch notes shared by the planner and duel-web. Styles: ./whatsNew.css.
export { PATCH_NOTES } from "./notes";
export type { PatchApp, PatchNote } from "./types";
export { groupByDate, latestNoteDate, noteKey, notesFor, unseenNotes, type AppName } from "./helpers";
export { lastSeenKey, loadUnseen, markAllSeen, markSeen, readLastSeen, readSeenOnLastDay, seenKeysKey, type NotesStorage } from "./lastSeen";
export { WHATS_NEW_PATH } from "./paths";
export { WhatsNewList } from "./WhatsNewList";
export { WhatsNewCard, type WhatsNewLinkProps } from "./WhatsNewCard";
