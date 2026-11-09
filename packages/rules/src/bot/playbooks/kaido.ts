/**
 * OP17-058 Kaido (#1173). [When Attacking]/[On Your Opponent's Attack][Once Per Turn] DON!! -1: up to 1 opponent Character gets
 * -2000 power this turn. The generic bot accepts every "may", so it pays a DON!! each time even when -2000 changes nothing.
 * The playbook pays only when the shrink decides something:
 *  - my attack: the battle target is a Character my attacker would lose to but beats after -2000, or another rested opposing
 *    Character gets within reach of my strongest attacker (the best power among my untapped Leader/Characters and this attacker),
 *    so a later attack can K.O. it (only rested Characters can be K.O.'d by an attack);
 *  - their attack: their Character attacker would beat my attacked card now and no longer does at -2000.
 * The select prompt then picks the Character that enables it (the attacker itself when defending).
 * Hints 1-6 (#1204) come from opdeckguide.com/deck-guides/kaido-op17, shonentcg.com's EB05 Kaido guide and Bandai deck_110.
 */
import type { Intent, PendingChoice } from "../../types.js";
import type { BotView } from "../types.js";
import { findBoardCard, type BoardCard } from "../value.js";
import { handDefIds } from "./common.js";
import type { LeaderPlaybook } from "./types.js";

const SHRINK = 2000;

const KING_MATES = ["OP17-074", "EB04-032", "OP17-073", "EB05-037", "OP07-077"];
const TEN_COSTS = ["OP17-062", "ST34-004", "OP14-069"];
const NINE_TEN = ["OP17-061", "OP17-065", "OP17-062", "ST34-004", "OP14-069"];
/** Hint 3: active DON!! from which EB04-031 gets its bonus; field DON!! at or below which the two DON!! makers do; at or above which OP17-062 does. */
export const KAIDO_KING_DON = 6;
export const KAIDO_MAKER_FIELD_DON_AT_OR_BELOW = 4;
export const KAIDO_BIG_FIELD_DON_AT_OR_ABOVE = 10;
/** Hint 3: EB05-034 is held back (this penalty) unless this many DON!! are out and the opponent has a Character. */
export const KAIDO_EB05_034_DON = 9;
export const KAIDO_EB05_034_PENALTY = 5;
/** Hint 5: decline a decisive -1 when it would leave fewer than this many DON!! for a 10-cost in hand, unless my Life is at or below KAIDO_LOW_LIFE. */
export const KAIDO_TEN_DON = 10;
export const KAIDO_LOW_LIFE = 2;

const fieldDon = (view: BotView): number =>
  view.you.costArea.length + view.you.leader.attachedDonCount + view.you.characters.reduce((n, c) => n + c.attachedDonCount, 0);
const kaidoRefundReady = (view: BotView): boolean =>
  view.you.characters.some((c) => c.defId === "OP17-062" && !(c.usedThisTurn ?? []).includes("op17-062#1"));
const biggestOpp = (view: BotView, ids: Set<string>): BoardCard | undefined =>
  [...view.opponent.characters].filter((c) => ids.has(c.id)).sort((a, b) => b.power - a.power)[0];

/** The opposing Character the -2000 should land on, or null when it would not matter. */
function shrinkTarget(view: BotView): BoardCard | null {
  const b = view.battle;
  if (!b) return null;
  if (b.attackerSeat !== view.seat) {
    const attacker = view.opponent.characters.find((c) => c.id === b.attackerId);
    const defended = b.target.kind === "leader" ? view.you.leader : view.you.characters.find((c) => c.id === (b.target as { instanceId: string }).instanceId);
    if (!attacker || !defended) return null;
    return attacker.power - SHRINK < defended.power && defended.power <= attacker.power ? attacker : null;
  }
  const mine = findBoardCard(view, b.attackerId)?.card;
  if (!mine) return null;
  if (b.target.kind === "character") {
    const victim = view.opponent.characters.find((c) => c.id === (b.target as { instanceId: string }).instanceId);
    if (victim && victim.power > mine.power && victim.power - SHRINK <= mine.power) return victim;
  }
  const best = Math.max(mine.power, ...[view.you.leader, ...view.you.characters].filter((c) => !c.rested && !c.summoningSick).map((c) => c.power));
  const enabled = view.opponent.characters.filter((c) => c.rested && c.power > best && c.power - SHRINK <= best);
  return enabled.sort((a, b2) => b2.power - a.power)[0] ?? null;
}

/** The original (#1173) answer: pay the -1 DON!! only when the -2000 decides something, and pick the Character that enables it. */
function baseAnswer(view: BotView, choice: PendingChoice): Intent | undefined {
  const target = shrinkTarget(view);
  const r = choice.request;
  if (r?.type === "select") {
    const option = target && r.options.find((o) => o.eligible && o.instanceId === target.id);
    return option ? { type: "resolve_pending_choice", accept: true, selectedOptionIds: [option.id] } : undefined;
  }
  if (r && r.type !== "confirm") return undefined;
  return target ? { type: "resolve_pending_choice", accept: true } : { type: "resolve_pending_choice", accept: false };
}

export const kaidoPlaybook: LeaderPlaybook = {
  leaderId: "OP17-058",
  name: "Kaido",
  /** Hint 2, mulligan (#1204): keep with EB04-031 plus a King mate, or two King mates; mulligan a hand that is mostly 9-10 cost cards. */
  mulligan(hand): "keep" | "mulligan" | undefined {
    const king = hand.includes("EB04-031");
    const mates = hand.filter((h) => KING_MATES.includes(h)).length;
    const distinct = new Set(hand.filter((h) => KING_MATES.includes(h))).size;
    if (king && distinct >= 1) return "keep";
    if (!king && mates >= 2) return "keep";
    const heavy = hand.filter((h) => NINE_TEN.includes(h)).length;
    if (heavy * 2 > hand.length) return "mulligan";
    return undefined;
  },
  /** Hint 6 (#1204): with a rested OP17-061 and EB04-031 or OP17-065 in hand, use OP17-061's ability first. */
  main(view: BotView): Intent | undefined {
    const lead = view.you.characters.find((c) => c.defId === "OP17-061" && c.rested);
    const target = view.you.hand.some((c) => c.defId === "EB04-031" || c.defId === "OP17-065");
    if (!lead || !target) return undefined;
    return view.legalIntents.find((i): i is Extract<Intent, { type: "activate_ability" }> => i.type === "activate_ability" && i.sourceId === lead.id && i.abilityId === "op17-061#1");
  },
  /** Hint 1 (#1204): before ending the turn, use EB04-032's ability when 2+ DON!! are active and the DON!! deck has a card. */
  beforeEndTurn(view: BotView): Intent | undefined {
    if (view.you.activeDonCount < 2 || view.you.donDeckCount < 1) return undefined;
    const queen = view.you.characters.find((c) => c.defId === "EB04-032");
    if (!queen) return undefined;
    return view.legalIntents.find((i) => i.type === "activate_ability" && i.sourceId === queen.id && i.abilityId === "eb04-032#1");
  },
  /** Hint 3, DON!! curve (#1204). */
  playBonus(view: BotView, defId: string): number {
    let b = 0;
    const don = view.you.activeDonCount;
    const onField = fieldDon(view);
    if (defId === "EB04-031" && don >= KAIDO_KING_DON) b += 3;
    if ((defId === "OP17-074" || defId === "EB04-032") && onField <= KAIDO_MAKER_FIELD_DON_AT_OR_BELOW) b += 2;
    if (defId === "OP17-062" && onField >= KAIDO_BIG_FIELD_DON_AT_OR_ABOVE) b += 2;
    if (defId === "EB05-034" && !(onField >= KAIDO_EB05_034_DON && view.opponent.characters.length > 0)) b -= KAIDO_EB05_034_PENALTY;
    return b;
  },
  answerChoice(view: BotView, choice: PendingChoice): Intent | undefined {
    const base = baseAnswer(view, choice);
    const mine = view.battle ? view.battle.attackerSeat === view.seat : view.activeSeat === view.seat;
    const r = choice.request;
    // Hint 4 (#1204): my turn, OP17-062's DON!! refund still unused: the DON!! return is free, so accept the -2000 anyway.
    if (mine && kaidoRefundReady(view) && choice.optional) {
      if (r?.type === "select") {
        if (base && base.type === "resolve_pending_choice" && base.accept) return base;
        const eligible = r.options.filter((o) => o.eligible && o.instanceId);
        const pick = biggestOpp(view, new Set(eligible.map((o) => o.instanceId!)));
        const opt = pick && eligible.find((o) => o.instanceId === pick.id);
        if (opt) return { type: "resolve_pending_choice", accept: true, selectedOptionIds: [opt.id] };
        return base;
      }
      if (!r || r.type === "confirm") return { type: "resolve_pending_choice", accept: true };
    }
    // Hint 5 (#1204): their attack, a decisive -1 would leave me short of 10 DON!! for a 10-cost in hand: decline unless Life is low.
    if (view.battle && view.battle.attackerSeat !== view.seat && choice.optional && (!r || r.type === "confirm" || r.type === "select")) {
      if (base && base.type === "resolve_pending_choice" && base.accept && fieldDon(view) + 2 < KAIDO_TEN_DON && handDefIds(view).some((h) => TEN_COSTS.includes(h)) && view.you.lifeCount > KAIDO_LOW_LIFE) {
        return { type: "resolve_pending_choice", accept: false };
      }
    }
    return base;
  },
};
