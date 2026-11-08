/**
 * ST30-001 Luffy & Ace. The Leader gets -2000 while I have a Character with 7000+ base power, and my Luffy/Ace cards get +3000
 * on the opponent's turn. So a big Character shrinks the attacking Leader: while the Leader can still attack this turn, a
 * hand Character with 7000+ base power is played later (penalty on its play score). Mulligan: the plan is a cost 4-5 Monkey.D.Luffy
 * Character plus a cost-1 searcher to find the rest; keep with both, redraw with neither, else the generic rule.
 */
import { getCardDef } from "../../cards/definitions.js";
import { namesOfDef } from "../../engine/evalCtx.js";
import type { BotView } from "../types.js";
import type { LeaderPlaybook } from "./types.js";

/** Play-score penalty for a hand Character with base power >= `LUFFY_ACE_BIG_POWER` while the Leader can still attack. */
export const LUFFY_ACE_BIG_PENALTY = 2;
export const LUFFY_ACE_BIG_POWER = 7000;
/** Cost range of the Monkey.D.Luffy Character the mulligan looks for. */
export const LUFFY_ACE_LUFFY_MIN_COST = 4;
export const LUFFY_ACE_LUFFY_MAX_COST = 5;
/** Cost-1 searchers: Nami (EB02-017, OP01-016), Jewelry Bonney, Thousand Sunny. */
export const LUFFY_ACE_SEARCHERS: readonly string[] = ["EB02-017", "OP01-016", "EB04-002", "ST31-005"];

export const luffyAcePlaybook: LeaderPlaybook = {
  leaderId: "ST30-001",
  name: "Luffy & Ace",
  mulligan(hand): "keep" | "mulligan" | undefined {
    const luffy = hand.some((id) => {
      const def = getCardDef(id);
      return def.type === "character" && namesOfDef(id).includes("Monkey.D.Luffy") && def.cost >= LUFFY_ACE_LUFFY_MIN_COST && def.cost <= LUFFY_ACE_LUFFY_MAX_COST;
    });
    const searcher = hand.some((id) => LUFFY_ACE_SEARCHERS.includes(id));
    return luffy && searcher ? "keep" : !luffy && !searcher ? "mulligan" : undefined;
  },
  playBonus(view: BotView, defId: string): number {
    const def = getCardDef(defId);
    if (def.type !== "character" || (def.power ?? 0) < LUFFY_ACE_BIG_POWER) return 0;
    const leaderId = view.you.leader.id;
    return view.legalIntents.some((i) => i.type === "declare_attack" && i.attackerId === leaderId) ? -LUFFY_ACE_BIG_PENALTY : 0;
  },
};
