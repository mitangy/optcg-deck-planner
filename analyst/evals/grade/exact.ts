/**
 * Exact-match grading of A, B and C answers against the gold: a verdict, a number, a legality call or a
 * percentage. The verdict itself is read out of the answer by the judge (see judge.ts).
 */
import type { Catalog } from "../../src/catalog";
import type { Gold, Verdict } from "../types";
import { closePercent, extractFacts } from "./extract";

const ODDS_TOL = 0.05;

export type Graded = { correct: 0 | 1; why: string };
const yes: Graded = { correct: 1, why: "matches the gold" };
const no = (why: string): Graded => ({ correct: 0, why });

const mentions = (answer: string, id: string, catalog: Catalog) => {
  const text = answer.toLowerCase();
  const name = catalog.cards.get(id)?.name.toLowerCase();
  return text.includes(id.toLowerCase()) || Boolean(name && text.includes(name));
};

/** Does a list of strings the judge pulled out name this card, by id or by name? */
const lists = (items: readonly string[], id: string, catalog: Catalog) =>
  items.some((s) => mentions(s, id, catalog));

/** A and B: the yes/no call, a date, a number, which cards can or cannot, and words the answer must say. */
export function gradeVerdict(gold: Gold, answer: string, v: Verdict, catalog: Catalog): Graded {
  const facts = extractFacts(answer);
  if (gold.verdict) {
    const said = v.verdict;
    if (gold.verdict === "no_ruling") {
      if (said !== "no" || !v.says_no_official_ruling) return no("should say no official ruling covers it, then answer no from the card text");
    } else if (said !== gold.verdict) return no(`said ${said}, gold is ${gold.verdict}`);
  }
  if (gold.dates && !gold.dates.some((d) => answer.toLowerCase().includes(d.toLowerCase()))) return no(`missing the date (${gold.dates[0]})`);
  if (gold.number !== undefined && !facts.numbers.includes(gold.number)) return no(`missing the number ${gold.number}`);
  for (const id of gold.can ?? []) if (!lists(v.can, id, catalog)) return no(`${id} should be listed as able`);
  for (const id of gold.cannot ?? []) {
    if (!lists(v.cannot, id, catalog) || lists(v.can, id, catalog)) return no(`${id} should be listed as unable`);
  }
  for (const m of gold.mustSay ?? []) if (!new RegExp(m.re, "i").test(answer)) return no(`missing /${m.re}/`);
  return yes;
}

/** C: a legality call that names an offender, or a probability within tolerance. */
export function gradeC(gold: Gold, answer: string, v: Verdict, catalog: Catalog): Graded {
  const facts = extractFacts(answer);
  if (gold.legal !== undefined) {
    const said = v.legal;
    if (said === "unclear" || (said === "legal") !== gold.legal) return no(`said ${said}, gold is ${gold.legal ? "legal" : "not legal"}`);
    if (!gold.legal) {
      const named = (gold.offending ?? []).some((id) => mentions(answer, id, catalog)) || (gold.mention !== undefined && facts.numbers.includes(gold.mention));
      if ((gold.offending?.length || gold.mention !== undefined) && !named) {
        return no(`didn't name the offending card (${(gold.offending ?? []).join(", ") || gold.mention})`);
      }
    }
  }
  if (gold.percent !== undefined && !facts.percents.some((p) => closePercent(p.value, gold.percent!, ODDS_TOL))) {
    return no(`no percentage near ${gold.percent}`);
  }
  if (gold.hits !== undefined && !facts.numbers.includes(gold.hits)) return no(`missing the count ${gold.hits}`);
  return yes;
}
