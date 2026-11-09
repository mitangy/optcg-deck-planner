/**
 * OP12-061 Donquixote Rosinante (#1173). [Activate: Main][Once Per Turn] DON!! -1: the next [Trafalgar Law] with cost 4+ played
 * from hand this turn costs 2 less. The generic policy never activates it (a DON!! -1 cost is not "cheap"), so the Leader's
 * whole plan sits unused. Paying 1 DON!! to save 2 is a net +1 DON!! this turn, so it is worth it exactly when that DON!! buys
 * something: the Law only fits with the discount, or the DON!! left over pays for another card in hand. Once the discount is
 * live (the hand row's `playCost` is below the printed cost) the Law is played at once, before the generic play scoring
 * can spend the DON!! on something else. EB04-038 "Rosinante & Law" counts as a Trafalgar Law (name_alias), so the engine's
 * own name check is used (`namesOfDef`).
 * Hints 1, 3 and 4 (#1204): see the comments on the DON!! deficit rule in `main`, `answerChoice` and `playBonus` (spellmana.com Rosinante
 * guide, Bandai deck_078, shonentcg.com).
 */
import { getCardDef } from "../../cards/definitions.js";
import { namesOfDef } from "../../engine/evalCtx.js";
import type { Intent } from "../../types.js";
import type { BotView } from "../types.js";
import type { LeaderPlaybook } from "./types.js";

const ABILITY = "op12-061#1";
const DISCOUNT = 2;
const MIN_COST = 4;

// Guide hints (#1204, spellmana.com Rosinante guide, Bandai deck_078, shonentcg.com).
const DON_LAWS = ["P-093", "EB04-038"];
/** Hint 3: at this Life or below Rosinante's optional Life payment is declined (at 2 only while EB04-038 is not on my field). */
export const ROSINANTE_DECLINE_LIFE_AT_OR_BELOW = 1;
export const ROSINANTE_DECLINE_LIFE_UNLESS_EB04 = 2;
/** Hint 4: EB04-058 play bonus at this Life or below. */
export const ROSINANTE_LIFE_PLAY_AT_OR_BELOW = 2;
export const ROSINANTE_LIFE_PLAY_BONUS = 3;

const isLaw = (defId: string): boolean => namesOfDef(defId).includes("Trafalgar Law") && getCardDef(defId).type === "character" && getCardDef(defId).cost >= MIN_COST;

export const rosinantePlaybook: LeaderPlaybook = {
  leaderId: "OP12-061",
  name: "Donquixote Rosinante",
  main(view: BotView): Intent | undefined {
    const hand = view.you.hand;
    // Hint 1, DON!! deficit (#1204): when paying 1 DON!! (activating) takes me from ahead of the opponent's DON!! to level with it,
    // and a discounted P-093 / EB04-038 is then payable, activate even if the Law would fit anyway.
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
  /** Hint 3, Life payment (#1204): decline the Leader's optional Life cost at 1 Life, or at 2 without EB04-038 on my field; else pay. */
  answerChoice(view: BotView, choice): Intent | undefined {
    if (choice.request && choice.request.type !== "confirm") return undefined;
    const life = view.you.lifeCount;
    const hasEb = view.you.characters.some((c) => c.defId === "EB04-038");
    if (life <= ROSINANTE_DECLINE_LIFE_AT_OR_BELOW || (life === ROSINANTE_DECLINE_LIFE_UNLESS_EB04 && !hasEb)) return { type: "resolve_pending_choice", accept: false };
    return { type: "resolve_pending_choice", accept: true };
  },
  /** Hint 4 (#1204): EB04-058 is worth playing at low Life. */
  playBonus(view: BotView, defId: string): number {
    return defId === "EB04-058" && view.you.lifeCount <= ROSINANTE_LIFE_PLAY_AT_OR_BELOW ? ROSINANTE_LIFE_PLAY_BONUS : 0;
  },
};
