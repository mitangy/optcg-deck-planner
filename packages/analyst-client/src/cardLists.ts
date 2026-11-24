import { normalizeCardId } from "@optcg/card-core";

export type CardListType = "leader" | "character" | "event" | "stage";

export type CardListRow = {
  id: string;
  name: string;
  type: CardListType;
  colors: string[];
  cost?: number;
  power?: number;
  counter?: number;
  reason: string;
  /** The deck may hold any number of copies, so Add does not stop at 4. */
  anyNumber: boolean;
};

/** Cards Log Pose found for a description. With a deck open, the analyst already left out what that leader can't use. */
export type CardList = { id: string; title: string; cards: CardListRow[]; leaderId: string | null };

/** Copies of one card number a deck may hold, unless the card says otherwise. */
export const MAX_COPIES = 4;

const MAX_ROWS = 24;
const TYPES: readonly string[] = ["leader", "character", "event", "stage"];
const isRec = (v: unknown): v is Record<string, unknown> => Boolean(v) && typeof v === "object" && !Array.isArray(v);
const str = (v: unknown, max: number): string | null => (typeof v === "string" && v.trim() ? v.slice(0, max) : null);
const num = (v: unknown, max: number): number | undefined => (typeof v === "number" && Number.isInteger(v) && v >= 0 && v <= max ? v : undefined);

export function parseCardList(raw: unknown): CardList | null {
  if (!isRec(raw)) return null;
  const id = str(raw.id, 64);
  if (!id) return null;
  const cards: CardListRow[] = [];
  const seen = new Set<string>();
  for (const c of Array.isArray(raw.cards) ? raw.cards : []) {
    if (!isRec(c) || cards.length >= MAX_ROWS) continue;
    const cid = str(c.id, 20);
    if (!cid || typeof c.type !== "string" || !TYPES.includes(c.type)) continue;
    const norm = normalizeCardId(cid);
    if (seen.has(norm)) continue;
    seen.add(norm);
    cards.push({
      id: norm,
      name: str(c.name, 120) ?? norm,
      type: c.type as CardListType,
      colors: (Array.isArray(c.colors) ? c.colors : []).filter((x): x is string => typeof x === "string").slice(0, 6),
      cost: num(c.cost, 99),
      power: num(c.power, 99999),
      counter: num(c.counter, 99999),
      reason: typeof c.reason === "string" ? c.reason.slice(0, 300) : "",
      anyNumber: c.any_number === true,
    });
  }
  if (!cards.length) return null;
  const leader = str(raw.leader_id, 20);
  return { id, title: str(raw.title, 80) ?? "Cards", cards, leaderId: leader ? normalizeCardId(leader) : null };
}

/** Copies of a card in the open deck. */
export const copiesIn = (cards: readonly { id: string; copies: number }[], id: string): number =>
  cards.reduce((n, c) => (normalizeCardId(c.id) === id ? n + c.copies : n), 0);

/** Whether one more copy fits: a leader never goes in the main deck, and a normal card stops at four. */
export const canAddCopy = (row: Pick<CardListRow, "type" | "anyNumber">, copies: number): boolean => row.type !== "leader" && (row.anyNumber || copies < MAX_COPIES);
