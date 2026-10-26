/**
 * New decks Log Pose builds (#726): reading a draft from the wire, the deck list the apps' create pages are filled with,
 * and the once-only auto-open memory. React-free.
 */
import { normalizeCardId, readIds, safeStorage, writeIds } from "./proposals";

export type DraftCard = { id: string; name: string; copies: number };

export type NewDeckDraft = {
  /** The model's tool_use id. */
  id: string;
  name: string;
  leaderId: string;
  leaderName: string;
  summary: string;
  cards: DraftCard[];
  /** Main deck cards: the copies added up. */
  count: number;
  legality: { legal: boolean; problems: string[]; upcoming: string[]; banListChecked: boolean };
};

const isRec = (v: unknown): v is Record<string, unknown> => Boolean(v) && typeof v === "object" && !Array.isArray(v);
const str = (v: unknown, max: number): string | null => (typeof v === "string" && v.trim() ? v.slice(0, max) : null);
const strings = (v: unknown): string[] => (Array.isArray(v) ? v.filter((x): x is string => typeof x === "string").slice(0, 20) : []);

/** A draft from an SSE event or a stored thread (snake_case on the wire), or null without an id, leader or any usable card. Bad cards are dropped. */
export function parseDraft(raw: unknown): NewDeckDraft | null {
  if (!isRec(raw)) return null;
  const id = str(raw.id, 64);
  const leaderId = str(raw.leader_id, 20);
  if (!id || !leaderId) return null;
  const cards: DraftCard[] = [];
  for (const c of Array.isArray(raw.cards) ? raw.cards : []) {
    if (!isRec(c)) continue;
    const cid = str(c.id, 20);
    const copies = c.copies;
    if (!cid || typeof copies !== "number" || !Number.isInteger(copies) || copies < 1 || copies > 50) continue;
    cards.push({ id: normalizeCardId(cid), name: str(c.name, 120) ?? cid, copies });
  }
  if (!cards.length) return null;
  const lg = isRec(raw.legality) ? raw.legality : {};
  return {
    id,
    name: str(raw.name, 60) ?? "New deck",
    leaderId: normalizeCardId(leaderId),
    leaderName: str(raw.leader_name, 120) ?? leaderId,
    summary: typeof raw.summary === "string" ? raw.summary.slice(0, 300) : "",
    cards,
    count: cards.reduce((n, c) => n + c.copies, 0),
    legality: { legal: lg.legal === true, problems: strings(lg.problems), upcoming: strings(lg.upcoming), banListChecked: lg.ban_list_checked === true },
  };
}

/** The deck as text, "1xLEADER" first then "4xOP01-006" lines: the form both apps' list importers read. */
export const deckListText = (d: NewDeckDraft): string => [`1x${d.leaderId}`, ...d.cards.map((c) => `${c.copies}x${c.id}`)].join("\n");

export const OPENED_DRAFTS_KEY = "optcg-logpose:opened-drafts";

/** The ids of the drafts already opened on this device. Never throws. */
export const readOpenedDrafts = (storage: Pick<Storage, "getItem"> | null = safeStorage()): string[] => readIds(OPENED_DRAFTS_KEY, storage);

/** Remembers that a draft was opened, keeping the newest 200. */
export const markDraftOpened = (id: string, storage: Pick<Storage, "getItem" | "setItem"> | null = safeStorage()): string[] => writeIds(OPENED_DRAFTS_KEY, id, true, storage);

/** Whether the card should open the create page by itself: a live draft (not from a saved thread) nobody opened yet. */
export function shouldAutoOpen(d: NewDeckDraft, opened: readonly string[] | ReadonlySet<string>, live: boolean): boolean {
  const done = Array.isArray(opened) ? (opened as string[]).includes(d.id) : (opened as ReadonlySet<string>).has(d.id);
  return live && !done;
}
