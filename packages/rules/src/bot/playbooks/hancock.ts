/**
 * OP14-041 Boa Hancock. [DON!! x1][Once Per Turn] when one of my Kuja Pirates/Amazon Lily Characters with 5000+ base power is
 * K.O.'d, add the top of the opponent's Life to their hand. The generic give logic leaves the Leader without DON!! when
 * nothing needs it to attack, which switches the ability off for the whole opponent turn. With nothing else left to do,
 * one DON!! goes on the Leader (attached DON!! stays through the opponent's turn).
 */
import { giveLeaderFirstDon } from "./common.js";
import type { LeaderPlaybook } from "./types.js";

export const hancockPlaybook: LeaderPlaybook = {
  leaderId: "OP14-041",
  name: "Boa Hancock",
  beforeEndTurn: giveLeaderFirstDon,
};
