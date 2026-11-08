/**
 * OP12-061 Donquixote Rosinante (#1173). [Activate: Main][Once Per Turn] DON!! -1: the next [Trafalgar Law] with cost 4+ played
 * from hand this turn costs 2 less. The generic policy never activates it (a DON!! -1 cost is not "cheap"), so the Leader's
 * whole plan sits unused. Paying 1 DON!! to save 2 is a net +1 DON!! this turn, so it is worth it exactly when that DON!! buys
 * something: the Law only fits with the discount, or the DON!! left over pays for another card in hand. Once the discount is
 * live (the hand row's `playCost` is below the printed cost) the Law is played at once, before the generic play scoring
 * can spend the DON!! on something else. EB04-038 "Rosinante & Law" counts as a Trafalgar Law (name_alias), so the engine's
 * own name check is used (`namesOfDef`).
 */
import { getCardDef } from "../../cards/definitions.js";
import { namesOfDef } from "../../engine/evalCtx.js";
import type { Intent } from "../../types.js";
import type { BotView } from "../types.js";
import type { LeaderPlaybook } from "./types.js";

const ABILITY = "op12-061#1";
const DISCOUNT = 2;
const MIN_COST = 4;

const isLaw = (defId: string): boolean => namesOfDef(defId).includes("Trafalgar Law") && getCardDef(defId).type === "character" && getCardDef(defId).cost >= MIN_COST;

export const rosinantePlaybook: LeaderPlaybook = {
  leaderId: "OP12-061",
  name: "Donquixote Rosinante",
  main(view: BotView): Intent | undefined {
    const hand = view.you.hand;
    const active = view.you.activeDonCount;
    const plays = view.legalIntents.filter((i): i is Extract<Intent, { type: "play_card" }> => i.type === "play_card");
    // The discount is live: play the discounted Law now (most expensive first).
    const discounted = plays
      .filter((p) => { const c = hand[p.handIndex]; return c && isLaw(c.defId) && (c.playCost ?? Infinity) < getCardDef(c.defId).cost; })
      .sort((a, b) => getCardDef(hand[b.handIndex]!.defId).cost - getCardDef(hand[a.handIndex]!.defId).cost)[0];
    if (discounted) return discounted;

    const activate = view.legalIntents.find((i): i is Extract<Intent, { type: "activate_ability" }> => i.type === "activate_ability" && i.sourceId === view.you.leader.id && i.abilityId === ABILITY);
    if (!activate) return undefined;
    for (const [index, card] of hand.entries()) {
      if (!isLaw(card.defId)) continue;
      const cost = card.playCost ?? getCardDef(card.defId).cost;
      const reduced = cost - DISCOUNT;
      // The DON!! -1 comes out of the cost area, and the discounted Law must still be payable afterwards.
      if (reduced > active - 1) continue;
      const castNow = cost <= active;
      const left = active - 1 - reduced;
      // Another card the saved DON!! makes playable (it was out of reach without the discount).
      const unlocks = hand.some((o, j) => {
        if (j === index) return false;
        const def = getCardDef(o.defId);
        const c = o.playCost ?? def.cost;
        return def.type !== "leader" && c > 0 && c <= left && (!castNow || c > active - cost);
      });
      if (!castNow || unlocks) return activate;
    }
    return undefined;
  },
};
