/**
 * The generic give logic only attaches DON!! to reach the opposing Leader's power, so the Leader often stays at 0
 * attached DON!! and the whole team misses its +1000.
 */
import type { Intent } from "../../types.js";
import type { BotView } from "../types.js";
import type { LeaderPlaybook } from "./types.js";

const BIG_COST = 8;
export const SABO_HOLD_PENALTY = 3;
export const SABO_HOLD_PENALTY_LATE = 2;
export const SABO_HOLD_DON = 4;

export const saboPlaybook: LeaderPlaybook = {
  leaderId: "OP13-004",
  name: "Sabo",
  main(view: BotView): Intent | undefined {
    if (view.you.leader.attachedDonCount > 0 || view.you.activeDonCount < 1) return undefined;
    if (!view.you.characters.some((c) => c.fieldCost >= BIG_COST)) return undefined;
    if (!view.legalIntents.some((i) => i.type === "declare_attack")) return undefined;
    return view.legalIntents.find((i): i is Extract<Intent, { type: "give_don" }> => i.type === "give_don" && i.targetId === view.you.leader.id);
  },
  playBonus(view: BotView, defId: string): number {
    let b = 0;
    if (defId === "ST01-011") b -= SABO_HOLD_PENALTY;
    if ((defId === "OP17-095" || defId === "OP17-086") && view.you.activeDonCount >= SABO_HOLD_DON) b -= SABO_HOLD_PENALTY_LATE;
    return b;
  },
};
