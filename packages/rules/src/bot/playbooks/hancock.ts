/**
 * The generic give logic leaves the Leader without DON!! when nothing needs it to attack, which switches the ability
 * off for the whole opponent turn. With nothing else left to do, one DON!! goes on the Leader (attached DON!! stays
 * through the opponent's turn).
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

export const HANCOCK_EARLY_BONUS = 2;
export const HANCOCK_SHAKUYAKU_HOLD_LIFE = 4;
export const HANCOCK_SHAKUYAKU_PUSH_LIFE = 3;
export const HANCOCK_GORGON_MIN_CREW = 3;
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
    if ((defId === ST17_004 || defId === NAMI) && view.you.leader.attachedDonCount === 0) b += HANCOCK_EARLY_BONUS;
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
