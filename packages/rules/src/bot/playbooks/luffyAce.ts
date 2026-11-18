/**
 * A big Character shrinks the attacking Leader (-2000), so while the Leader can still attack this turn a hand
 * Character with 7000+ base power is played later.
 */
import { getCardDef } from "../../cards/definitions.js";
import { namesOfDef } from "../../engine/evalCtx.js";
import type { BotView } from "../types.js";
import type { LeaderPlaybook } from "./types.js";

export const LUFFY_ACE_BIG_PENALTY = 2;
export const LUFFY_ACE_BIG_POWER = 7000;
export const LUFFY_ACE_LUFFY_MIN_COST = 4;
export const LUFFY_ACE_LUFFY_MAX_COST = 5;
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
