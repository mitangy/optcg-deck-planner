/**
 * OP14-041 Boa Hancock. [DON!! x1][Once Per Turn] when one of my Kuja Pirates/Amazon Lily Characters with 5000+ base power is
 * K.O.'d, add the top of the opponent's Life to their hand. The generic give logic leaves the Leader without DON!! when
 * nothing needs it to attack, which switches the ability off for the whole opponent turn. With nothing else left to do,
 * one DON!! goes on the Leader (attached DON!! stays through the opponent's turn).
 * Hints 1 and 4 (#1204) come from onepiece.gg's Hancock guide, overlordtcgz1 and opdeckguide.com.
 */
import { getCardDef } from "../../cards/definitions.js";
import type { BotView } from "../types.js";
import { giveLeaderFirstDon } from "./common.js";
import type { LeaderPlaybook } from "./types.js";

const ST17_004 = "ST17-004";
const NAMI = "EB03-053";
const SHAKUYAKU = "OP14-107";
const GORGON = "OP14-105";
const EB05_028 = "EB05-028";
const HANCOCK9 = "OP14-112";

/** Hint 1: play bonus for the two early Characters while the Leader has no DON!! (they bring the DON!! plan online). */
export const HANCOCK_EARLY_BONUS = 2;
/** Hint 4: the opponent's Life from which OP14-107 is held back (at or above) / pushed (at or below the second). */
export const HANCOCK_SHAKUYAKU_HOLD_LIFE = 4;
export const HANCOCK_SHAKUYAKU_PUSH_LIFE = 3;
/** Hint 4: OP14-105 needs this many other Kuja Pirates / Amazon Lily cards in hand. */
export const HANCOCK_GORGON_MIN_CREW = 3;
/** Hint 4: EB03-053 bonus from this opposing Life up; EB05-028 held below this opposing hand size; OP14-112 once this many DON!! are out. */
export const HANCOCK_NAMI_MIN_LIFE = 3;
export const HANCOCK_EB05_028_MIN_OPP_HAND = 9;
export const HANCOCK_HANCOCK9_DON = 9;

const isKujaOrLily = (defId: string): boolean => {
  const t = getCardDef(defId).traits ?? [];
  return t.includes("Kuja Pirates") || t.includes("Amazon Lily");
};

export const hancockPlaybook: LeaderPlaybook = {
  leaderId: "OP14-041",
  name: "Boa Hancock",
  beforeEndTurn: giveLeaderFirstDon,
  playBonus(view: BotView, defId: string): number {
    let b = 0;
    const oppLife = view.opponent.lifeCount;
    // Hint 1 (#1204): ST17-004 and EB03-053 first, while the Leader has no DON!! attached.
    if ((defId === ST17_004 || defId === NAMI) && view.you.leader.attachedDonCount === 0) b += HANCOCK_EARLY_BONUS;
    // Hint 4, situational cards (#1204).
    if (defId === SHAKUYAKU) b += oppLife >= HANCOCK_SHAKUYAKU_HOLD_LIFE ? -3 : oppLife <= HANCOCK_SHAKUYAKU_PUSH_LIFE ? 2 : 0;
    if (defId === GORGON) {
      const crew = view.you.hand.filter((c, i, a) => i !== a.findIndex((x) => x.defId === GORGON) && isKujaOrLily(c.defId)).length;
      if (crew < HANCOCK_GORGON_MIN_CREW) b -= 2;
    }
    if (defId === NAMI && oppLife >= HANCOCK_NAMI_MIN_LIFE) b += 2;
    if (defId === EB05_028 && view.opponent.handCount < HANCOCK_EB05_028_MIN_OPP_HAND) b -= 2;
    if (defId === HANCOCK9 && view.you.costArea.length >= HANCOCK_HANCOCK9_DON) b += 3;
    return b;
  },
};
