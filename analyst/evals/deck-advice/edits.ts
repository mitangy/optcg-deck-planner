/**
 * What the answer changes (#678), the deck that results, and how much of the sabotage it undid.
 * The chat emits a structured proposal (the Apply card) when a deck is open; that is read first. An answer
 * with no proposal falls back to its +N / -N lines (the same ones the D-group edit check reads).
 */
import type { Catalog } from "../../src/catalog";
import { parseDeckText } from "../../src/decks";
import type { DeckEditProposal } from "../../src/proposals";
import { applyDeltas, type Delta } from "../grade/edits";
import { extractFacts } from "../grade/extract";
import { deckText } from "./cases";
import type { Copies } from "./sabotage";

export type AdviceEdits = { source: "proposal" | "text" | "none"; deltas: Delta[] };

const sumDeltas = (deltas: readonly Delta[]): Delta[] => {
  const m = new Map<string, number>();
  for (const d of deltas) m.set(d.id, (m.get(d.id) ?? 0) + d.delta);
  return [...m].filter(([, delta]) => delta !== 0).map(([id, delta]) => ({ id, delta }));
};

/** The last successful proposal of the turn (a refused one never reaches the app), else the answer's +N / -N lines. */
export function extractAdviceEdits(proposals: readonly Pick<DeckEditProposal, "lines">[], answer: string): AdviceEdits {
  const last = proposals[proposals.length - 1];
  if (last) {
    const deltas = sumDeltas(last.lines.map((l) => ({ id: l.id, delta: l.after - l.before })));
    if (deltas.length) return { source: "proposal", deltas };
  }
  const text = sumDeltas(extractFacts(answer).edits.map((e) => ({ id: e.id, delta: e.sign === "+" ? e.copies : -e.copies })));
  return text.length ? { source: "text", deltas: text } : { source: "none", deltas: [] };
}

export type AppliedEdits = { cards: Copies[]; legal: boolean; problems: string[]; added: number; removed: number };

/** The deck after the edits, and whether it is legal (50 cards, copies, colors, leader rules and, when given, the ban list). */
export function applyAdvice(catalog: Catalog, leaderId: string, cards: readonly Copies[], edits: AdviceEdits, extraProblems?: Parameters<typeof applyDeltas>[3]): AppliedEdits {
  const deck = parseDeckText(catalog, deckText(leaderId, cards));
  const r = applyDeltas(catalog, deck, edits.deltas, extraProblems);
  const after = r.edited.cards.map((c) => ({ id: c.id, copies: c.copies }));
  const diff = removalsAndAdditions(cards, after);
  return { cards: after, legal: edits.deltas.length > 0 && r.legal, problems: edits.deltas.length ? r.problems : ["the answer has no edits to apply"], ...diff };
}

/** Copies gone from, and new in, the deck. */
function removalsAndAdditions(before: readonly Copies[], after: readonly Copies[]): { added: number; removed: number } {
  const a = new Map(after.map((c) => [c.id, c.copies]));
  const b = new Map(before.map((c) => [c.id, c.copies]));
  let added = 0;
  let removed = 0;
  for (const id of new Set([...a.keys(), ...b.keys()])) {
    const d = (a.get(id) ?? 0) - (b.get(id) ?? 0);
    if (d > 0) added += d;
    else removed -= d;
  }
  return { added, removed };
}

export type Removal = {
  /** Planted copies the edits took out, over the planted copies; null when nothing was planted. */
  recall: number | null;
  /** Planted copies taken out, over all copies taken out; null when nothing was taken out. */
  precision: number | null;
  plantedRemoved: number;
  planted: number;
  removed: number;
};

/** Recall and precision of the removals, from the deck the player had and the deck after the edits. */
export function scoreRemoval(planted: readonly Copies[], before: readonly Copies[], after: readonly Copies[]): Removal {
  const a = new Map(after.map((c) => [c.id, c.copies]));
  const gone = (id: string, copies: number) => Math.max(0, copies - (a.get(id) ?? 0));
  const removed = before.reduce((s, c) => s + gone(c.id, c.copies), 0);
  const plantedCopies = planted.reduce((s, c) => s + c.copies, 0);
  const plantedRemoved = planted.reduce((s, c) => s + Math.min(c.copies, gone(c.id, before.find((x) => x.id === c.id)?.copies ?? c.copies)), 0);
  return {
    recall: plantedCopies ? plantedRemoved / plantedCopies : null,
    precision: plantedCopies && removed ? plantedRemoved / removed : null,
    plantedRemoved,
    planted: plantedCopies,
    removed,
  };
}

/** The edits as lines for a reader: "+2 OP01-016 Nami". */
export function editLines(catalog: Catalog, deltas: readonly Delta[]): string[] {
  const line = (d: Delta) => `${d.delta > 0 ? "+" : "-"}${Math.abs(d.delta)} ${d.id} ${catalog.cards.get(d.id)?.name ?? ""}`.trim();
  return [...deltas.filter((d) => d.delta > 0), ...deltas.filter((d) => d.delta < 0)].map(line);
}
