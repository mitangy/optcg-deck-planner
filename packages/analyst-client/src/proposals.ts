/**
 * Deck edit suggestions as the apps see them (#400): reading a proposal from the wire, working out what its
 * Apply card should offer for the deck that is open now, and the reverse diff Undo applies. React-free.
 */

export type DeckEditLine = { id: string; name: string; before: number; after: number; reason: string };

export type DeckEditProposal = {
  /** The model's tool_use id. */
  id: string;
  target: { ref: string; name: string; leaderId: string | null };
  summary: string;
  lines: DeckEditLine[];
  /** The deck as the model saw it, with normalized ids. */
  base: { id: string; copies: number }[];
  legality: { legal: boolean; count: number; problems: string[]; upcoming: string[]; banListChecked: boolean };
};

/** One card's change: from `before` copies to `after`. */
export type DeckEditOp = { id: string; before: number; after: number };

/** The deck an app has open, and how it saves a change to it. */
export type DeckEditor = {
  /** "planner:<deckId>" or "duel:<savedDeckId>", the same ref the app sends in the chat context. */
  ref: string;
  /** The open deck's main cards as they are now (leader and DON!! left out). */
  cards: { id: string; copies: number }[];
  /** Saves the ops with the app's own deck save path; rejects with a message the card shows. */
  apply: (ops: DeckEditOp[]) => Promise<void>;
  /** How many copies of a card the player owns, when the app knows. */
  owned?: (id: string) => number | undefined;
  /** A muted line the card shows for this deck (e.g. that a linked planner deck is not updated). */
  note?: string;
};

/** The same card number as the analyst's: trimmed, upper case, without a `_P1` / `_R1` art suffix. */
export const normalizeCardId = (id: string): string => id.trim().toUpperCase().replace(/_(?:P\d+|R\d+)$/, "");

const isRec = (v: unknown): v is Record<string, unknown> => Boolean(v) && typeof v === "object" && !Array.isArray(v);
const str = (v: unknown, max = 400): string | null => (typeof v === "string" ? v.slice(0, max) : null);
const count = (v: unknown): number | null => (typeof v === "number" && Number.isInteger(v) && v >= 0 && v <= 500 ? v : null);
const strings = (v: unknown): string[] => (Array.isArray(v) ? v.filter((x): x is string => typeof x === "string").slice(0, 20) : []);

/** A proposal from an SSE event or a stored thread (snake_case on the wire), or null when its target or lines are unusable. Bad lines are dropped. */
export function parseProposal(raw: unknown): DeckEditProposal | null {
  if (!isRec(raw)) return null;
  const id = str(raw.id, 64);
  const target = raw.target;
  if (!id || !isRec(target)) return null;
  const ref = str(target.ref, 80);
  const name = str(target.name, 200);
  if (!ref || name === null) return null;
  const lines: DeckEditLine[] = [];
  for (const l of Array.isArray(raw.lines) ? raw.lines : []) {
    if (!isRec(l)) continue;
    const lid = str(l.id, 20);
    const before = count(l.before);
    const after = count(l.after);
    if (!lid || before === null || after === null || before === after) continue;
    lines.push({ id: normalizeCardId(lid), name: str(l.name, 120) ?? lid, before, after, reason: str(l.reason, 300) ?? "" });
  }
  if (!lines.length) return null;
  const base: DeckEditProposal["base"] = [];
  for (const c of Array.isArray(raw.base) ? raw.base : []) {
    if (!isRec(c)) continue;
    const cid = str(c.id, 20);
    const copies = count(c.copies);
    if (cid && copies !== null) base.push({ id: normalizeCardId(cid), copies });
  }
  const lg = isRec(raw.legality) ? raw.legality : {};
  return {
    id,
    target: { ref, name, leaderId: str(target.leader_id, 20) },
    summary: str(raw.summary, 300) ?? "",
    lines,
    base,
    legality: {
      legal: lg.legal === true,
      count: count(lg.count) ?? 0,
      problems: strings(lg.problems),
      upcoming: strings(lg.upcoming),
      banListChecked: lg.ban_list_checked === true,
    },
  };
}

export type ProposalKind = "ready" | "applied" | "conflict" | "elsewhere" | "dismissed";

export type ProposalState = {
  kind: ProposalKind;
  /** Other cards (not in the proposal) differ from the deck the model saw. */
  drifted: boolean;
  /** For a conflict: the touched cards that are not at `before`, with their copies now. */
  changed: { id: string; now: number }[];
};

function copiesOf(cards: readonly { id: string; copies: number }[]): Map<string, number> {
  const m = new Map<string, number>();
  for (const c of cards) m.set(normalizeCardId(c.id), (m.get(normalizeCardId(c.id)) ?? 0) + c.copies);
  return m;
}

/** What the card offers now, from the live deck: derived every time, so it survives a reload and Undo needs no memory. */
export function proposalState(p: DeckEditProposal, editor: DeckEditor | null | undefined, dismissed: readonly string[] | ReadonlySet<string> = []): ProposalState {
  if (!editor || editor.ref !== p.target.ref) return { kind: "elsewhere", drifted: false, changed: [] };
  const now = copiesOf(editor.cards);
  const has = (id: string) => now.get(id) ?? 0;
  const touched = new Set(p.lines.map((l) => l.id));
  const base = copiesOf(p.base);
  const others = new Set([...now.keys(), ...base.keys()]);
  const drifted = [...others].some((id) => !touched.has(id) && has(id) !== (base.get(id) ?? 0));
  const changed = p.lines.filter((l) => has(l.id) !== l.before).map((l) => ({ id: l.id, now: has(l.id) }));
  const atBefore = changed.length === 0;
  const atAfter = p.lines.every((l) => has(l.id) === l.after);
  let kind: ProposalKind = atBefore ? "ready" : atAfter ? "applied" : "conflict";
  const gone = Array.isArray(dismissed) ? (dismissed as string[]).includes(p.id) : (dismissed as ReadonlySet<string>).has(p.id);
  if (gone && (kind === "ready" || kind === "conflict")) kind = "dismissed";
  return { kind, drifted, changed: kind === "conflict" || kind === "dismissed" ? changed : [] };
}

/** The ops Apply sends: every line, from `before` to `after`. */
export const applyOps = (p: DeckEditProposal): DeckEditOp[] => p.lines.map((l) => ({ id: l.id, before: l.before, after: l.after }));

/** The ops Undo sends: each line back from `after` to `before`. */
export const undoOps = (p: DeckEditProposal): DeckEditOp[] => p.lines.map((l) => ({ id: l.id, before: l.after, after: l.before }));

/** An answer bubble worth keeping: it has text, a deck edit, or was stopped on purpose. */
export const isEmptyAnswer = (m: { text: string; proposals?: readonly unknown[]; stopped?: boolean }): boolean =>
  !m.text && !m.proposals?.length && !m.stopped;

export const DISMISSED_KEY = "optcg-logpose:dismissed";
const MAX_DISMISSED = 200;

/** The ids of the edits the player dismissed on this device. Never throws; empty when storage is blocked. */
export function readDismissed(storage: Pick<Storage, "getItem"> | null = safeStorage()): string[] {
  try {
    const parsed: unknown = JSON.parse(storage?.getItem(DISMISSED_KEY) ?? "[]");
    return Array.isArray(parsed) ? parsed.filter((x): x is string => typeof x === "string").slice(-MAX_DISMISSED) : [];
  } catch {
    return [];
  }
}

/** Remembers (or forgets) one dismissed edit, keeping the newest 200. */
export function writeDismissed(id: string, dismissed: boolean, storage: Pick<Storage, "getItem" | "setItem"> | null = safeStorage()): string[] {
  const next = readDismissed(storage).filter((x) => x !== id);
  if (dismissed) next.push(id);
  const kept = next.slice(-MAX_DISMISSED);
  try {
    storage?.setItem(DISMISSED_KEY, JSON.stringify(kept));
  } catch {
    // A per-viewer convenience: without storage the card just forgets on reload.
  }
  return kept;
}

function safeStorage(): Storage | null {
  try {
    return typeof localStorage === "undefined" ? null : localStorage;
  } catch {
    return null;
  }
}
