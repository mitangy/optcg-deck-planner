/**
 * OP05-098 Enel. [Opponent's Turn][Once Per Turn] when my Life becomes 0: add the top of my deck to Life, then trash 1 card
 * from hand. At exactly 1 Life a hit on the Leader is therefore free once per turn: the Life card goes to hand and a fresh
 * one comes from the deck. The generic defense spends blockers and counters to stop that hit; the playbook lets it through
 * when the refill is still there. Not when: the ability was already used this turn (the view's `usedThisTurn` on the Leader),
 * the attacker has Double Attack (the second point would hit 0 Life), the refill would take the last card of the deck, or the
 * attack misses anyway / targets a Character (generic handles those).
 */
import type { Intent } from "../../types.js";
import type { BotView } from "../types.js";
import { findBoardCard } from "../value.js";
import type { LeaderPlaybook } from "./types.js";

/** Toggle: let the single remaining Life be hit while the refill is available. */
export const ENEL_LET_THROUGH = true;
const ABILITY = "op05-098#m0";

export const enelPlaybook: LeaderPlaybook = {
  leaderId: "OP05-098",
  name: "Enel",
  defense(view: BotView): Intent | undefined {
    const b = view.battle;
    if (!ENEL_LET_THROUGH || !b || b.attackerSeat === view.seat || b.target.kind !== "leader") return undefined;
    if (view.you.lifeCount !== 1 || view.you.deckCount < 2) return undefined;
    if (view.you.leader.usedThisTurn?.includes(ABILITY)) return undefined;
    const attacker = findBoardCard(view, b.attackerId)?.card;
    if (!attacker || attacker.keywords.includes("double_attack")) return undefined;
    return view.legalIntents.find((i) => i.type === "pass_block" || i.type === "pass_counter");
  },
};
