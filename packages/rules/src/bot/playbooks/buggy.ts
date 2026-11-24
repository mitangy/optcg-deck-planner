/** The generic policy never uses it (5 DON!! is not "cheap"). */
import { getCardDef } from "../../cards/definitions.js";
import type { Intent } from "../../types.js";
import type { BotView } from "../types.js";
import type { LeaderPlaybook } from "./types.js";

const REST = 5;
const MIN_COST = 7;

export const buggyPlaybook: LeaderPlaybook = {
  leaderId: "OP09-042",
  name: "Buggy",
  main(view: BotView): Intent | undefined {
    const active = view.you.activeDonCount;
    // The trash cost may be paid with the Character itself, so a second card must be in hand.
    if (active < REST || view.you.hand.length < 2) return undefined;
    const target = view.you.hand.some((c) => {
      const def = getCardDef(c.defId);
      return def.type === "character" && (def.traits ?? []).includes("Cross Guild") && def.cost >= MIN_COST && def.cost > active;
    });
    if (!target) return undefined;
    return view.legalIntents.find((i) => i.type === "activate_ability" && i.sourceId === view.you.leader.id);
  },
};
