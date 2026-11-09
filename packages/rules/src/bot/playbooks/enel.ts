/**
 * OP05-098 Enel. [Opponent's Turn][Once Per Turn] when my Life becomes 0: add the top of my deck to Life, then trash 1 card
 * from hand. At exactly 1 Life a hit on the Leader is therefore free once per turn: the Life card goes to hand and a fresh
 * one comes from the deck. The generic defense spends blockers and counters to stop that hit; the playbook lets it through
 * when the refill is still there. Not when: the ability was already used this turn (the view's `usedThisTurn` on the Leader),
 * the attacker has Double Attack (the second point would hit 0 Life), the refill would take the last card of the deck, or the
 * attack misses anyway / targets a Character (generic handles those).
 * Hints 3 and 6 (#1204): Life-adding cards and Charlotte Pudding are played earlier when they pay off (shonentcg.com yellow Enel and
 * Big Mom guides, corazontcg.com).
 */
import { getCardDef } from "../../cards/definitions.js";
import type { Intent } from "../../types.js";
import type { BotView } from "../types.js";
import { findBoardCard } from "../value.js";
import type { LeaderPlaybook } from "./types.js";

/** Toggle: let the single remaining Life be hit while the refill is available. */
export const ENEL_LET_THROUGH = true;
const ABILITY = "op05-098#m0";

// Guide hints (#1204, shonentcg.com yellow Enel + Big Mom guides, corazontcg.com).
const PUDDING = "OP17-109";
const LIFE_ADDERS = ["OP17-106", "OP17-114", "OP16-119", "OP15-113", "EB04-058"];
const REST2_ADDERS = ["OP17-106", "OP17-114"];
/** Hint 3: Life-adding cards get this much minus my Life as a play bonus (more when Life is low). */
export const ENEL_LIFE_BONUS_BASE = 3;
/** Hint 3: penalty for a card that rests 2 DON!! when fewer than 2 would be left, and for OP15-113 with a nearly empty hand. */
export const ENEL_PAYMENT_PENALTY = 2;
/** Hint 3: OP15-113 is penalised at this hand size or below. */
export const ENEL_THIN_HAND = 2;
/** Hint 6: OP17-109 gets +1 up to this turn number. */
export const ENEL_PUDDING_LAST_TURN = 4;

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
  playBonus(view: BotView, defId: string): number {
    let b = 0;
    const life = view.you.lifeCount;
    // Hint 3, Life adders (#1204): the lower my Life, the more a card that adds Life is worth; EB04-058 a bit more at 2 or less;
    // the two that rest 2 DON!! wait until they can be paid and still leave 2; OP15-113 waits for a bigger hand.
    if (LIFE_ADDERS.includes(defId)) {
      b += Math.max(0, ENEL_LIFE_BONUS_BASE - life);
      if (defId === "EB04-058" && life <= 2) b += 1;
      if (REST2_ADDERS.includes(defId)) {
        const cost = view.you.hand.find((c) => c.defId === defId)?.playCost ?? getCardDef(defId).cost;
        if (view.you.activeDonCount - cost < 2) b -= ENEL_PAYMENT_PENALTY;
      }
      if (defId === "OP15-113" && view.you.hand.length <= ENEL_THIN_HAND) b -= ENEL_PAYMENT_PENALTY;
    }
    // Hint 6, early OP17-109 (#1204).
    if (defId === PUDDING && view.turnNumber <= ENEL_PUDDING_LAST_TURN) b += 1;
    return b;
  },
};
