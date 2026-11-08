/**
 * OP17-039 Rocks.D.Xebec (#1173). [When Attacking] You may trash 1 card from hand: reveal the top card; if it is a Rocks Pirates
 * card, draw 2. The generic bot always pays the card. With a small hand the card is worth more as a Counter or a play than
 * the gamble, so below the threshold the playbook declines. Tune `ROCKS_MIN_HAND_TO_TRASH`.
 */
import type { Intent } from "../../types.js";
import type { BotView } from "../types.js";
import type { LeaderPlaybook } from "./types.js";

/** Decline the trash cost when the hand holds at most this many cards. */
export const ROCKS_DECLINE_HAND_AT_OR_BELOW = 3;

export const rocksPlaybook: LeaderPlaybook = {
  leaderId: "OP17-039",
  name: "Rocks.D.Xebec",
  answerChoice(view: BotView, choice): Intent | undefined {
    if (choice.request && choice.request.type !== "confirm") return undefined;
    return view.you.hand.length <= ROCKS_DECLINE_HAND_AT_OR_BELOW ? { type: "resolve_pending_choice", accept: false } : undefined;
  },
};
