/**
 * OP13-004 Sabo (#1173). [DON!! x1] If I have a Character with cost 8+, my Leader and all my Characters get +1000 power. The
 * generic give logic only attaches DON!! to reach the opposing Leader's power, so the Leader often stays at 0 attached DON!!
 * and the whole team misses its +1000. With a cost-8+ Character out (the cost the view shows, `fieldCost`, includes cost
 * buffs) and something able to attack, one DON!! goes on the Leader first.
 */
import type { Intent } from "../../types.js";
import type { BotView } from "../types.js";
import type { LeaderPlaybook } from "./types.js";

const BIG_COST = 8;

export const saboPlaybook: LeaderPlaybook = {
  leaderId: "OP13-004",
  name: "Sabo",
  main(view: BotView): Intent | undefined {
    if (view.you.leader.attachedDonCount > 0 || view.you.activeDonCount < 1) return undefined;
    if (!view.you.characters.some((c) => c.fieldCost >= BIG_COST)) return undefined;
    if (!view.legalIntents.some((i) => i.type === "declare_attack")) return undefined;
    return view.legalIntents.find((i): i is Extract<Intent, { type: "give_don" }> => i.type === "give_don" && i.targetId === view.you.leader.id);
  },
};
