/**
 * The generic policy never activates it (a DON!! -1 cost is not "cheap"). Paying 1 DON!! to save 2 is a net +1 DON!!
 * this turn.
 */
import { getCardDef } from "../../cards/definitions.js";
import { namesOfDef } from "../../engine/evalCtx.js";
import type { Intent } from "../../types.js";
import type { BotView } from "../types.js";
import type { LeaderPlaybook } from "./types.js";

const ABILITY = "op12-061#1";
const DISCOUNT = 2;
const MIN_COST = 4;

const DON_LAWS = ["P-093", "EB04-038"];
export const ROSINANTE_DECLINE_LIFE_AT_OR_BELOW = 1;
export const ROSINANTE_DECLINE_LIFE_UNLESS_EB04 = 2;
export const ROSINANTE_LIFE_PLAY_AT_OR_BELOW = 2;
export const ROSINANTE_LIFE_PLAY_BONUS = 3;

const isLaw = (defId: string): boolean => namesOfDef(defId).includes("Trafalgar Law") && getCardDef(defId).type === "character" && getCardDef(defId).cost >= MIN_COST;

export const rosinantePlaybook: LeaderPlaybook = {
  leaderId: "OP12-061",
  name: "Donquixote Rosinante",
  main(view: BotView): Intent | undefined {
    const hand = view.you.hand;
    const leaderActivate = view.legalIntents.find((i) => i.type === "activate_ability" && i.sourceId === view.you.leader.id && i.abilityId === ABILITY);
    if (leaderActivate) {
      const mine = view.you.costArea.length + view.you.leader.attachedDonCount + view.you.characters.reduce((n, c) => n + c.attachedDonCount, 0);
      const opp = view.opponent.costAreaCount + view.opponent.leader.attachedDonCount + view.opponent.characters.reduce((n, c) => n + c.attachedDonCount, 0);
      if (mine > opp && mine - 1 <= opp) {
        const payable = hand.some((c) => DON_LAWS.includes(c.defId) && (c.playCost ?? getCardDef(c.defId).cost) - DISCOUNT <= view.you.activeDonCount - 1);
        if (payable) return leaderActivate;
      }
    }
    const active = view.you.activeDonCount;
    const plays = view.legalIntents.filter((i): i is Extract<Intent, { type: "play_card" }> => i.type === "play_card");
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
  answerChoice(view: BotView, choice): Intent | undefined {
    if (choice.request && choice.request.type !== "confirm") return undefined;
    const life = view.you.lifeCount;
    const hasEb = view.you.characters.some((c) => c.defId === "EB04-038");
    if (life <= ROSINANTE_DECLINE_LIFE_AT_OR_BELOW || (life === ROSINANTE_DECLINE_LIFE_UNLESS_EB04 && !hasEb)) return { type: "resolve_pending_choice", accept: false };
    return { type: "resolve_pending_choice", accept: true };
  },
  playBonus(view: BotView, defId: string): number {
    return defId === "EB04-058" && view.you.lifeCount <= ROSINANTE_LIFE_PLAY_AT_OR_BELOW ? ROSINANTE_LIFE_PLAY_BONUS : 0;
  },
};
