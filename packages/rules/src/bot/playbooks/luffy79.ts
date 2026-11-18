/**
 * Cards that "gain +12 cost" are cheap to play but become 12+ on the field; the first one out turns the plan on, so a
 * hand Character that would be 12+ gets a play bonus.
 */
import { abilitiesFor } from "../../cards/abilities.js";
import { getCardDef } from "../../cards/definitions.js";
import type { BotView } from "../types.js";
import type { LeaderPlaybook } from "./types.js";

export const LUFFY79_ENABLER_BONUS = 3;
const BIG_COST = 12;

export function fieldCostIfPlayed(view: BotView, defId: string): number {
  const def = getCardDef(defId);
  const leaderTraits = getCardDef(view.you.leader.defId).traits ?? [];
  let cost = def.cost;
  for (const a of abilitiesFor(defId)) {
    if (a.trigger !== "static" || !(a.conditions ?? []).every((c) => c.c === "leader_trait" && c.traits.some((t) => leaderTraits.includes(t)))) continue;
    for (const s of a.statics ?? []) if (s.s === "cost" && s.target === "self" && typeof s.amount === "number") cost += s.amount;
  }
  return cost;
}

export const luffy79Playbook: LeaderPlaybook = {
  leaderId: "OP17-079",
  name: "Monkey.D.Luffy (OP17)",
  playBonus(view: BotView, defId: string): number {
    if (getCardDef(defId).type !== "character" || view.you.characters.some((c) => c.fieldCost >= BIG_COST)) return 0;
    return fieldCostIfPlayed(view, defId) >= BIG_COST ? LUFFY79_ENABLER_BONUS : 0;
  },
};
