/**
 * OP17-079 Monkey.D.Luffy (black). My Characters with cost 12+ gain [Blocker], and the deck's cards that "gain +12 cost" (Rodo,
 * Gerd, Saul, Loki) are cheap to play but become 12+ on the field. The first one out turns the whole plan on (Blockers, and
 * the deck's 12+ cost payoffs), so while none is on the field a hand Character that would be 12+ gets a play bonus.
 * The field cost is read from the card's own static "+N cost" abilities (conditions: only {Leader trait} ones are checked).
 */
import { abilitiesFor } from "../../cards/abilities.js";
import { getCardDef } from "../../cards/definitions.js";
import type { BotView } from "../types.js";
import type { LeaderPlaybook } from "./types.js";

/** Play-score bonus for an enabler while no 12+ cost Character is out. */
export const LUFFY79_ENABLER_BONUS = 3;
const BIG_COST = 12;

/** The cost a Character card would have on the field with my Leader, counting its own "+N cost" statics. */
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
