/**
 * The generic defense spends blockers and counters to stop a hit that is free at exactly 1 Life; the playbook lets it
 * through when the refill is still there.
 */
import { getCardDef } from "../../cards/definitions.js";
import type { Intent } from "../../types.js";
import type { BotView } from "../types.js";
import { findBoardCard } from "../value.js";
import type { LeaderPlaybook } from "./types.js";

export const ENEL_LET_THROUGH = true;
const ABILITY = "op05-098#m0";

const PUDDING = "OP17-109";
const LIFE_ADDERS = ["OP17-106", "OP17-114", "OP16-119", "OP15-113", "EB04-058"];
const REST2_ADDERS = ["OP17-106", "OP17-114"];
export const ENEL_LIFE_BONUS_BASE = 3;
export const ENEL_PAYMENT_PENALTY = 2;
export const ENEL_THIN_HAND = 2;
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
    if (LIFE_ADDERS.includes(defId)) {
      b += Math.max(0, ENEL_LIFE_BONUS_BASE - life);
      if (defId === "EB04-058" && life <= 2) b += 1;
      if (REST2_ADDERS.includes(defId)) {
        const cost = view.you.hand.find((c) => c.defId === defId)?.playCost ?? getCardDef(defId).cost;
        if (view.you.activeDonCount - cost < 2) b -= ENEL_PAYMENT_PENALTY;
      }
      if (defId === "OP15-113" && view.you.hand.length <= ENEL_THIN_HAND) b -= ENEL_PAYMENT_PENALTY;
    }
    if (defId === PUDDING && view.turnNumber <= ENEL_PUDDING_LAST_TURN) b += 1;
    return b;
  },
};
