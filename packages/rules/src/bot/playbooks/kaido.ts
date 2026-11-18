/**
 * The generic bot accepts every "may", so it pays a DON!! each time even when -2000 changes nothing; the playbook pays
 * only when the shrink decides something.
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
export const KAIDO_KING_DON = 6;
export const KAIDO_MAKER_FIELD_DON_AT_OR_BELOW = 4;
export const KAIDO_BIG_FIELD_DON_AT_OR_ABOVE = 10;
export const KAIDO_EB05_034_DON = 9;
export const KAIDO_EB05_034_PENALTY = 5;
export const KAIDO_TEN_DON = 10;
export const KAIDO_LOW_LIFE = 2;

const fieldDon = (view: BotView): number =>
  view.you.costArea.length + view.you.leader.attachedDonCount + view.you.characters.reduce((n, c) => n + c.attachedDonCount, 0);
const kaidoRefundReady = (view: BotView): boolean =>
  view.you.characters.some((c) => c.defId === "OP17-062" && !(c.usedThisTurn ?? []).includes("op17-062#1"));
const biggestOpp = (view: BotView, ids: Set<string>): BoardCard | undefined =>
  [...view.opponent.characters].filter((c) => ids.has(c.id)).sort((a, b) => b.power - a.power)[0];

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
  main(view: BotView): Intent | undefined {
    const lead = view.you.characters.find((c) => c.defId === "OP17-061" && c.rested);
    const target = view.you.hand.some((c) => c.defId === "EB04-031" || c.defId === "OP17-065");
    if (!lead || !target) return undefined;
    return view.legalIntents.find((i): i is Extract<Intent, { type: "activate_ability" }> => i.type === "activate_ability" && i.sourceId === lead.id && i.abilityId === "op17-061#1");
  },
  beforeEndTurn(view: BotView): Intent | undefined {
    if (view.you.activeDonCount < 2 || view.you.donDeckCount < 1) return undefined;
    const queen = view.you.characters.find((c) => c.defId === "EB04-032");
    if (!queen) return undefined;
    return view.legalIntents.find((i) => i.type === "activate_ability" && i.sourceId === queen.id && i.abilityId === "eb04-032#1");
  },
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
    if (view.battle && view.battle.attackerSeat !== view.seat && choice.optional && (!r || r.type === "confirm" || r.type === "select")) {
      if (base && base.type === "resolve_pending_choice" && base.accept && fieldDon(view) + 2 < KAIDO_TEN_DON && handDefIds(view).some((h) => TEN_COSTS.includes(h)) && view.you.lifeCount > KAIDO_LOW_LIFE) {
        return { type: "resolve_pending_choice", accept: false };
      }
    }
    return base;
  },
};
