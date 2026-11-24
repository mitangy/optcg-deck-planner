import { MAIN_DECK_SIZE } from "@optcg/card-core";
import { abilitiesFor } from "./abilities.js";
import { getCardDef, normalizeCardDefId } from "./definitions.js";

function leaderRules(leaderId: string): string[] {
  return abilitiesFor(normalizeCardDefId(leaderId)).flatMap((a) => (a.statics ?? []).flatMap((s) => (s.s === "deck_rule" ? [s.rule] : [])));
}

const MAX_COPIES = 4;

function anyNumberAllowed(defId: string): boolean {
  return abilitiesFor(defId).some((a) => (a.statics ?? []).some((s) => s.s === "deck_rule" && s.rule === "any_number"));
}

export function deckConstructionErrors(leaderId: string, deck: readonly string[]): string[] {
  const errors: string[] = [];
  const leader = getCardDef(normalizeCardDefId(leaderId));
  if (deck.length !== MAIN_DECK_SIZE) errors.push(`A deck needs exactly ${MAIN_DECK_SIZE} cards (this one has ${deck.length})`);
  const copies = new Map<string, number>();
  const offColor = new Set<string>();
  for (const raw of deck) {
    const def = getCardDef(normalizeCardDefId(raw));
    copies.set(def.id, (copies.get(def.id) ?? 0) + 1);
    if (!def.colors.some((c) => leader.colors.includes(c))) offColor.add(def.id);
  }
  const over = [...copies].filter(([id, n]) => n > MAX_COPIES && !anyNumberAllowed(id)).map(([id, n]) => `${id} (${n})`).sort();
  if (over.length) errors.push(`A deck can hold at most ${MAX_COPIES} copies of a card: ${over.join(", ")}`);
  if (offColor.size) errors.push(`Every card must share a color with the Leader (${leader.name} is ${leader.colors.join("/")}): ${[...offColor].sort().join(", ")}`);
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
