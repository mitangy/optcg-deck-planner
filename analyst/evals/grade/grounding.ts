/**
 * "Numbers come from tools": every percentage, game count, win count and card number in the answer must
 * appear in a tool result or in what the player wrote.
 */
import type { Catalog } from "../../src/catalog";
import { CARD_ID, closePercent, extractFacts } from "./extract";

const PERCENT_TOL = 0.05;
const WHOLE_TOL = 0.5;

export type Grounding = { ok: boolean; ungrounded: string[] };

export type GroundingOptions = { catalog: Catalog; /** Only check percentages (the no_invented_rate check). */ percentsOnly?: boolean };

export function grounded(answer: string, corpus: { tools: string; user: string }, opts: GroundingOptions): Grounding {
  const facts = extractFacts(answer);
  const source = [corpus.tools, corpus.user].join("\n");
  const known = extractFacts(source);
  const ungrounded: string[] = [];
  for (const p of facts.percents) {
    // A tool that printed a whole number (78%) may have rounded it, so half a point either way is accepted.
    // A whole-number answer ("about 35%") is grounded when it is a tool's percentage (35.3%) rounded to the nearest point.
    const found = known.percents.some(
      (c) =>
        closePercent(p.value, c.value, PERCENT_TOL) ||
        (Number.isInteger(c.value) && closePercent(p.value, c.value, WHOLE_TOL)) ||
        (p.whole && p.value === Math.round(c.value)),
    );
    if (!found) ungrounded.push(`${p.value}%`);
  }
  if (opts.percentsOnly) return { ok: ungrounded.length === 0, ungrounded };
  for (const n of facts.games) if (!known.games.includes(n)) ungrounded.push(`${n} games`);
  for (const n of facts.wins) if (!known.wins.includes(n)) ungrounded.push(`${n} wins`);
  const haystack = new Set([...source.matchAll(CARD_ID)].map((m) => m[1]!));
  for (const id of facts.cardIds) {
    if (!opts.catalog.cards.has(id) || !haystack.has(id)) ungrounded.push(id);
  }
  return { ok: ungrounded.length === 0, ungrounded };
}
