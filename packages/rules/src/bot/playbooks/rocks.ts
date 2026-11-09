/**
 * OP17-039 Rocks.D.Xebec (#1173, #1204). [When Attacking] You may trash 1 card from hand: reveal the top card; if it is a Rocks
 * Pirates card, draw 2. The generic bot always pays the card. Sources for the hints below: shonentcg.com/blog/op-17-xebec-deck-guide
 * and opdeckguide.com (#1204).
 */
import type { Intent } from "../../types.js";
import type { BotView } from "../types.js";
import { costAreaDon } from "./common.js";
import type { LeaderPlaybook } from "./types.js";

/** Trash rule (#1204, Xebec guides): decline the trash cost when the hand holds at most this many cards (the last card is worth more than the reveal). */
export const ROCKS_DECLINE_HAND_AT_OR_BELOW = 1;
/** Hint 4: DON!! in the cost area from which the OP17-118 finisher gets its bonus. */
export const ROCKS_FINISHER_DON = 10;
/** Hint 4: size of the play bonus (or penalty) for the situational cards. */
export const ROCKS_SITUATIONAL_BONUS = 2;
/** Hint 4: opposing Characters at or above this power are worth removing. */
export const ROCKS_REMOVAL_POWER = 5000;
/** Hint 5: play penalty for OP08-051, which the guides keep for later. */
export const ROCKS_HOLD_PENALTY = 3;

const FINISHER = "OP17-118";
const REMOVAL_COST_5 = "OP17-046";
const REMOVAL_COST_6 = "OP17-054";
const HELD_CARD = "OP08-051";

export const rocksPlaybook: LeaderPlaybook = {
  leaderId: "OP17-039",
  name: "Rocks.D.Xebec",
  /** Hint 1, trash rule (#1204, Xebec guides): never trash the last card for the reveal; with 2+ cards the generic answer (pay) stands. Replaces the old "decline at hand <= 3". */
  answerChoice(view: BotView, choice): Intent | undefined {
    if (choice.request && choice.request.type !== "confirm") return undefined;
    return view.you.hand.length <= ROCKS_DECLINE_HAND_AT_OR_BELOW ? { type: "resolve_pending_choice", accept: false } : undefined;
  },
  playBonus(view: BotView, defId: string): number {
    let b = 0;
    const opp = view.opponent.characters;
    // Hint 4, situational cards (#1204, Xebec guides): the finisher once 10 DON!! are out; the two removal cards only when a target is there.
    if (defId === FINISHER && costAreaDon(view) >= ROCKS_FINISHER_DON) b += ROCKS_SITUATIONAL_BONUS;
    if (defId === REMOVAL_COST_5) b += opp.some((c) => c.fieldCost <= 5 && c.power >= ROCKS_REMOVAL_POWER) ? ROCKS_SITUATIONAL_BONUS : -ROCKS_SITUATIONAL_BONUS;
    if (defId === REMOVAL_COST_6 && opp.some((c) => c.fieldCost <= 6 && c.power >= ROCKS_REMOVAL_POWER)) b += ROCKS_SITUATIONAL_BONUS;
    // Hint 5, hold OP08-051 (#1204, Xebec guides).
    if (defId === HELD_CARD) b -= ROCKS_HOLD_PENALTY;
    return b;
  },
};
