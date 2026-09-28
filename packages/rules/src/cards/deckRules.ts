/**
 * Deck-construction rules printed on Leaders ("Under the rules of this game,
 * you cannot include …"). Encoded as `deck_rule` statics on the Leader.
 */
import { abilitiesFor } from "./abilities.js";
import { getCardDef, normalizeCardDefId } from "./definitions.js";

function leaderRules(leaderId: string): string[] {
  return abilitiesFor(normalizeCardDefId(leaderId)).flatMap((a) => (a.statics ?? []).flatMap((s) => (s.s === "deck_rule" ? [s.rule] : [])));
}

/** Violations of the Leader's deck-construction rules (empty when legal). */
export function deckConstructionErrors(leaderId: string, deck: readonly string[]): string[] {
  const errors: string[] = [];
  const leader = getCardDef(normalizeCardDefId(leaderId));
  for (const rule of leaderRules(leaderId)) {
    const [kind, arg] = rule.split(":") as [string, string | undefined];
    const offending = new Set<string>();
    for (const raw of deck) {
      const def = getCardDef(normalizeCardDefId(raw));
      if (kind === "max_cost" && def.cost > Number(arg)) offending.add(def.id);
      if (kind === "no_events_cost_ge" && def.type === "event" && def.cost >= Number(arg)) offending.add(def.id);
      if (kind === "only_trait" && !(def.traits ?? []).includes(arg ?? "")) offending.add(def.id);
    }
    if (!offending.size) continue;
    const list = [...offending].sort().join(", ");
    if (kind === "max_cost") errors.push(`${leader.name} cannot include cards with a cost of ${Number(arg) + 1} or more: ${list}`);
    if (kind === "no_events_cost_ge") errors.push(`${leader.name} cannot include Events with a cost of ${arg} or more: ${list}`);
    if (kind === "only_trait") errors.push(`${leader.name} can only include {${arg}} type cards: ${list}`);
  }
  return errors;
}
