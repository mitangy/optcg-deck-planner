/**
 * Deck-advice cases (#678): every meta deck as it is ("tune this list for the current meta"), and a sabotaged copy
 * of each (see sabotage.ts) with the planted cards recorded. Both are asked the same way.
 */
import type { Catalog } from "../../src/catalog";
import { metaFrequency, rng, sabotage, seedOf, shuffled, type Copies, type MetaDeck } from "./sabotage";

export type AdviceCase = {
  id: string;
  kind: "meta" | "sabotaged";
  leaderId: string;
  /** Name from the meta deck file. */
  name: string;
  /** Index of the source deck in the meta deck list (it is left out of this case's opposing field). */
  source: number;
  /** The deck the player has: the meta deck, or its sabotaged copy. */
  cards: Copies[];
  /** The meta deck as played (the ceiling for a sabotaged case). */
  original: Copies[];
  planted: Copies[];
  removed: Copies[];
  k: number | null;
  question: string;
  deckText: string;
  /** What the player sends: the question and the pasted deck. */
  message: string;
};

export type CaseMode = "all" | "meta" | "sabotaged";

const QUESTIONS = [
  "Can you tune this list for the current meta?",
  "Here's my deck. What would you change to do better in the current meta?",
  "Tune this deck for the current meta. What swaps would you make?",
  "I keep losing with this list. What should I change for the current meta?",
];

export function deckText(leaderId: string, cards: readonly Copies[]): string {
  return [`1x${leaderId}`, ...[...cards].sort((a, b) => a.id.localeCompare(b.id)).map((c) => `${c.copies}x${c.id}`)].join("\n");
}

const copiesOf = (ids: readonly string[]): Copies[] => {
  const m = new Map<string, number>();
  for (const id of ids) m.set(id, (m.get(id) ?? 0) + 1);
  return [...m].map(([id, copies]) => ({ id, copies })).sort((a, b) => a.id.localeCompare(b.id));
};

export type BuildOptions = { mode: CaseMode; seed: number; n?: number; banned?: ReadonlySet<string>; restricted?: ReadonlySet<string> };

/**
 * The cases for a meta deck list, in a stable order (each deck as is, then its sabotaged copy). With `n`, a seeded
 * pick of n of them, so a small run still mixes both kinds and different leaders.
 */
export function buildCases(catalog: Catalog, decks: readonly MetaDeck[], opts: BuildOptions): AdviceCase[] {
  const freq = metaFrequency(decks);
  const all: AdviceCase[] = [];
  decks.forEach((d, source) => {
    const original = copiesOf(d.deck);
    const asked = (cards: Copies[], salt: string) => {
      const question = QUESTIONS[Math.floor(rng(seedOf(opts.seed, `${d.leaderId}${salt}`))() * QUESTIONS.length)]!;
      const text = deckText(d.leaderId, cards);
      return { question, deckText: text, message: `${question}\n\n${text}` };
    };
    if (opts.mode !== "sabotaged") {
      all.push({ id: `meta-${d.leaderId}`, kind: "meta", leaderId: d.leaderId, name: d.name, source, cards: original, original, planted: [], removed: [], k: null, ...asked(original, "meta") });
    }
    if (opts.mode !== "meta") {
      const s = sabotage(catalog, d, { seed: opts.seed, freq, banned: opts.banned, restricted: opts.restricted });
      if (!s) throw new Error(`No legal sabotage for ${d.leaderId} (seed ${opts.seed}).`);
      all.push({ id: `sabotaged-${d.leaderId}`, kind: "sabotaged", leaderId: d.leaderId, name: d.name, source, cards: s.cards, original, planted: s.planted, removed: s.removed, k: s.k, ...asked(s.cards, "sab") });
    }
  });
  if (opts.n === undefined || opts.n >= all.length) return all;
  const picked = new Set(shuffled(all.map((c) => c.id), rng(seedOf(opts.seed, "pick"))).slice(0, Math.max(0, opts.n)));
  return all.filter((c) => picked.has(c.id));
}
