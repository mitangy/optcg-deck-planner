// Player-facing patch notes shared by the planner and duel-web. Styles: ./whatsNew.css.
// The notes load on demand (./loadNotes); a static import of ./notes would put them back in the entry bundle.
export { loadPatchNotes, usePatchNotes } from "./loadNotes";
export type { PatchApp, PatchNote } from "./types";
export { groupByDate, latestNoteDate, noteKey, notesFor, unseenNotes, type AppName } from "./helpers";
export { lastSeenKey, loadUnseen, markAllSeen, markSeen, readLastSeen, readSeenOnLastDay, seenKeysKey, type NotesStorage } from "./lastSeen";
export { WHATS_NEW_PATH } from "./paths";
export { WhatsNewFeed, WhatsNewList } from "./WhatsNewList";
export { WhatsNewCard, type WhatsNewLinkProps } from "./WhatsNewCard";
