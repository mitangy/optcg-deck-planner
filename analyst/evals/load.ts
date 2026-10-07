/** Validates the eval cases before anything runs, so a typo fails here and not halfway through a paid run. */
import type { Catalog } from "../src/catalog";
import { CASES } from "./cases";
import { CARD_ID } from "./grade/extract";
import type { EvalCase } from "./types";

export const EXPECTED_COUNTS = { A: 15, B: 12, C: 13, D: 10 } as const;

const GROUPS = new Set(["A", "B", "C", "D", "E"]);

export function validateCases(catalog: Catalog, cases: readonly EvalCase[], opts: { counts?: boolean } = {}): string[] {
  const problems: string[] = [];
  const seen = new Set<string>();
  const counts: Record<string, number> = {};
  for (const c of cases) {
    const where = c.id;
    if (seen.has(c.id)) problems.push(`${where}: duplicate id`);
    seen.add(c.id);
    if (!GROUPS.has(c.group)) {
      problems.push(`${where}: unknown group ${String(c.group)}`);
      continue;
    }
    counts[c.group] = (counts[c.group] ?? 0) + 1;
    for (const id of new Set(JSON.stringify(c).match(CARD_ID) ?? [])) {
      if (!catalog.cards.has(id)) problems.push(`${where}: ${id} is not in the card catalog`);
    }
    if (c.group === "A") {
      if (!c.faq || !c.verdict) problems.push(`${where}: an A case needs faq and verdict`);
      else if ("qh" in c.faq && !/^[0-9a-f]{8}$/.test(c.faq.qh)) problems.push(`${where}: qh must be 8 hex characters`);
      else if ("general" in c.faq && !/^[0-9a-f]{8}$/.test(c.faq.general)) problems.push(`${where}: the general qh must be 8 hex characters`);
    }
    if (c.group === "B" && !(c.scenario && (c.verdict || c.number !== undefined || c.can?.length))) problems.push(`${where}: a B case needs a scenario and a verdict, number or can/cannot`);
    if (c.group === "C" && !c.expect) problems.push(`${where}: a C case needs expect`);
    if ((c.group === "D" || c.group === "E") && !c.focus?.length) problems.push(`${where}: a ${c.group} case needs focus items`);
  }
  if (opts.counts ?? true) {
    for (const [g, n] of Object.entries(EXPECTED_COUNTS)) {
      if ((counts[g] ?? 0) !== n) problems.push(`group ${g} has ${counts[g] ?? 0} cases, expected ${n}`);
    }
  }
  return problems;
}

/** The cases, or an error naming every problem. */
export function loadCases(catalog: Catalog, cases: readonly EvalCase[] = CASES, opts: { counts?: boolean } = {}): EvalCase[] {
  const problems = validateCases(catalog, cases, opts);
  if (problems.length) throw new Error(`The eval cases are invalid:\n${problems.join("\n")}`);
  return [...cases];
}
