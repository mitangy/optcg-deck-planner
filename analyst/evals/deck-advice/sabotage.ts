/**
 * Sabotaged decks for the deck-advice eval (#678). A meta deck is the answer key: a deterministic, seeded swap
 * takes `k` (4 to 8) copies of its core cards out and puts clearly off-plan cards of the leader's colors in. A
 * good deck-tuning answer should take the planted cards back out, and we know exactly which they are.
 *
 * Heuristic, in one place so it can be argued with:
 *  - Removed ("on-plan") copies: up to 2 copies each of the deck's core cards (3 or 4 copies first, then 2, then
 *    any), picked in a seeded order until k copies are gone.
 *  - Planted ("off-plan") cards: vanilla characters (no rules text) that cost 5 or more, in the leader's colors,
 *    sharing no trait with the leader, never banned or restricted, and not already in the deck. They are ranked
 *    by how many of the meta decks play them (fewest first, so a card nobody plays), then by Counter value
 *    (none first), then by cost, highest first. A seeded pick from the top 8 of that ranking, 2 copies each (the
 *    last may get 1). If a leader has fewer than 8 such vanillas, the pool widens to keyword-less characters
 *    that cost 5 or more, then to any card of the leader's colors.
 *  - The result must still be a legal 50 card deck for the leader; a planted card that breaks that is skipped.
 */
import { analyzeDeck } from "../../src/analysis";
import type { Catalog, CardRow } from "../../src/catalog";
import { deckFromLines } from "../../src/decks";

export type Copies = { id: string; copies: number };
export type MetaDeck = { name: string; leaderId: string; deck: string[] };

export const SABOTAGE_MIN = 4;
export const SABOTAGE_MAX = 8;
/** Cards of the ranking a planted card is picked from. */
const POOL = 8;

/** A small seeded generator (mulberry32). Same seed, same sequence, on every machine. */
export function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** A seed from a number and a string (leader id, case id), so different decks shuffle differently. */
export function seedOf(seed: number, text: string): number {
  let h = (seed ^ 0x811c9dc5) >>> 0;
  for (let i = 0; i < text.length; i++) h = Math.imul(h ^ text.charCodeAt(i), 0x01000193) >>> 0;
  // Final mix, so similar strings (case-1, case-2) differ in every bit and not only the low ones.
  h ^= h >>> 16;
  h = Math.imul(h, 0x85ebca6b) >>> 0;
  h ^= h >>> 13;
  h = Math.imul(h, 0xc2b2ae35) >>> 0;
  return (h ^ (h >>> 16)) >>> 0;
}

export function shuffled<T>(items: readonly T[], next: () => number): T[] {
  const out = [...items];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(next() * (i + 1));
    [out[i], out[j]] = [out[j]!, out[i]!];
  }
  return out;
}

/** The number of meta decks that play each card (once per deck). */
export function metaFrequency(decks: readonly MetaDeck[]): Map<string, number> {
  const freq = new Map<string, number>();
  for (const d of decks) for (const id of new Set(d.deck)) freq.set(id, (freq.get(id) ?? 0) + 1);
  return freq;
}

export function toCopies(ids: readonly string[]): Copies[] {
  const m = new Map<string, number>();
  for (const id of ids) m.set(id, (m.get(id) ?? 0) + 1);
  return [...m].map(([id, copies]) => ({ id, copies })).sort((a, b) => a.id.localeCompare(b.id));
}

export type Sabotage = {
  /** The sabotaged main deck (50 cards). */
  cards: Copies[];
  k: number;
  /** What was put in, and what was taken out. */
  planted: Copies[];
  removed: Copies[];
};

const countOf = (cards: readonly Copies[]) => cards.reduce((s, c) => s + c.copies, 0);

/** Planted-card candidates for a leader, best first, in widening tiers. */
export function plantCandidates(catalog: Catalog, leaderId: string, freq: ReadonlyMap<string, number>, banned: ReadonlySet<string>, exclude: ReadonlySet<string>): CardRow[] {
  const leader = catalog.cards.get(leaderId);
  if (!leader) return [];
  const inColors = (c: CardRow) => c.colors.length > 0 && c.colors.every((col) => leader.colors.includes(col));
  const noSharedTrait = (c: CardRow) => !c.traits.some((t) => leader.traits.includes(t));
  const base = [...catalog.cards.values()].filter((c) => c.type !== "leader" && inColors(c) && !banned.has(c.id) && !exclude.has(c.id) && !/^DON/i.test(c.id));
  const rank = (a: CardRow, b: CardRow) =>
    (freq.get(a.id) ?? 0) - (freq.get(b.id) ?? 0) || (a.counter ?? 0) - (b.counter ?? 0) || (b.cost ?? 0) - (a.cost ?? 0) || a.id.localeCompare(b.id);
  const vanilla = (c: CardRow) => c.type === "character" && c.support === "vanilla" && (c.cost ?? 0) >= 5 && noSharedTrait(c);
  const tiers = [base.filter(vanilla), base.filter((c) => c.type === "character" && (c.cost ?? 0) >= 5 && c.keywords.length === 0 && noSharedTrait(c) && c.support !== "unsupported"), base.filter((c) => c.support !== "unsupported")];
  for (const tier of tiers) if (tier.length >= POOL) return tier.sort(rank);
  return tiers[tiers.length - 1]!.sort(rank);
}

/**
 * Sabotage a legal deck. Deterministic for (deck, seed). `k` defaults to a seeded value from 4 to 8.
 * Returns null when no legal sabotage exists (it should not happen with real meta decks).
 */
export function sabotage(catalog: Catalog, source: MetaDeck, opts: { seed: number; k?: number; freq: ReadonlyMap<string, number>; banned?: ReadonlySet<string>; restricted?: ReadonlySet<string> }): Sabotage | null {
  const next = rng(seedOf(opts.seed, source.leaderId));
  const k = opts.k ?? SABOTAGE_MIN + Math.floor(next() * (SABOTAGE_MAX - SABOTAGE_MIN + 1));
  const original = toCopies(source.deck);

  // Take out k copies: core cards first, at most 2 copies from each card.
  const order = shuffled(original, next);
  const removedBy = new Map<string, number>();
  let left = k;
  for (const minCopies of [3, 2, 1]) {
    for (const c of order) {
      if (left <= 0) break;
      if (c.copies < minCopies) continue;
      const take = Math.min(2, c.copies - (removedBy.get(c.id) ?? 0), left);
      if (take <= 0) continue;
      removedBy.set(c.id, (removedBy.get(c.id) ?? 0) + take);
      left -= take;
    }
  }
  if (left > 0) return null;
  const kept = original.map((c) => ({ id: c.id, copies: c.copies - (removedBy.get(c.id) ?? 0) })).filter((c) => c.copies > 0);
  const removed = [...removedBy].map(([id, copies]) => ({ id, copies })).sort((a, b) => a.id.localeCompare(b.id));

  // Put k copies of off-plan cards in; the picks come from the top of the ranking, and each must keep the deck legal.
  const exclude = new Set([...original.map((c) => c.id), ...(opts.restricted ?? [])]);
  const pool = plantCandidates(catalog, source.leaderId, opts.freq, opts.banned ?? new Set(), exclude).slice(0, POOL * 3);
  const head = shuffled(pool.slice(0, POOL), next);
  const candidates = [...head, ...pool.slice(POOL)];
  const planted: Copies[] = [];
  let toPlant = k;
  for (const card of candidates) {
    if (toPlant <= 0) break;
    const copies = Math.min(2, toPlant);
    const trial = [...kept, ...planted, { id: card.id, copies }];
    // The deck is short of 50 cards until the last card goes in, so only the other rules are checked here.
    if (analyzeDeck(catalog, deckFromLines(catalog, trial, source.leaderId)).hints.some((h) => h.tier === "rule" && h.id !== "count")) continue;
    planted.push({ id: card.id, copies });
    toPlant -= copies;
  }
  if (toPlant > 0) return null;
  const cards = [...kept, ...planted].sort((a, b) => a.id.localeCompare(b.id));
  if (countOf(cards) !== countOf(original) || !analyzeDeck(catalog, deckFromLines(catalog, cards, source.leaderId)).legal) return null;
  return { cards, k, planted: planted.sort((a, b) => a.id.localeCompare(b.id)), removed };
}
