/** The generic bot always pays the card. */
import type { Intent } from "../../types.js";
import type { BotView } from "../types.js";
import { costAreaDon } from "./common.js";
import type { LeaderPlaybook } from "./types.js";

export const ROCKS_DECLINE_HAND_AT_OR_BELOW = 1;
export const ROCKS_FINISHER_DON = 10;
export const ROCKS_SITUATIONAL_BONUS = 2;
export const ROCKS_REMOVAL_POWER = 5000;
export const ROCKS_HOLD_PENALTY = 3;

const FINISHER = "OP17-118";
const REMOVAL_COST_5 = "OP17-046";
const REMOVAL_COST_6 = "OP17-054";
const HELD_CARD = "OP08-051";

export const rocksPlaybook: LeaderPlaybook = {
  leaderId: "OP17-039",
  name: "Rocks.D.Xebec",
  answerChoice(view: BotView, choice): Intent | undefined {
    if (choice.request && choice.request.type !== "confirm") return undefined;
    return view.you.hand.length <= ROCKS_DECLINE_HAND_AT_OR_BELOW ? { type: "resolve_pending_choice", accept: false } : undefined;
  },
  playBonus(view: BotView, defId: string): number {
    let b = 0;
    const opp = view.opponent.characters;
    if (defId === FINISHER && costAreaDon(view) >= ROCKS_FINISHER_DON) b += ROCKS_SITUATIONAL_BONUS;
    if (defId === REMOVAL_COST_5) b += opp.some((c) => c.fieldCost <= 5 && c.power >= ROCKS_REMOVAL_POWER) ? ROCKS_SITUATIONAL_BONUS : -ROCKS_SITUATIONAL_BONUS;
    if (defId === REMOVAL_COST_6 && opp.some((c) => c.fieldCost <= 6 && c.power >= ROCKS_REMOVAL_POWER)) b += ROCKS_SITUATIONAL_BONUS;
    if (defId === HELD_CARD) b -= ROCKS_HOLD_PENALTY;
    return b;
  },
};
