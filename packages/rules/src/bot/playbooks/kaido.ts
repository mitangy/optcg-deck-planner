/**
 * OP17-058 Kaido (#1173). [When Attacking]/[On Your Opponent's Attack][Once Per Turn] DON!! -1: up to 1 opponent Character gets
 * -2000 power this turn. The generic bot accepts every "may", so it pays a DON!! each time even when -2000 changes nothing.
 * The playbook pays only when the shrink decides something:
 *  - my attack: the battle target is a Character my attacker would lose to but beats after -2000, or another rested opposing
 *    Character gets within reach of my strongest attacker (the best power among my untapped Leader/Characters and this attacker),
 *    so a later attack can K.O. it (only rested Characters can be K.O.'d by an attack);
 *  - their attack: their Character attacker would beat my attacked card now and no longer does at -2000.
 * The select prompt then picks the Character that enables it (the attacker itself when defending).
 */
import type { Intent, PendingChoice } from "../../types.js";
import type { BotView } from "../types.js";
import { findBoardCard, type BoardCard } from "../value.js";
import type { LeaderPlaybook } from "./types.js";

const SHRINK = 2000;

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

export const kaidoPlaybook: LeaderPlaybook = {
  leaderId: "OP17-058",
  name: "Kaido",
  answerChoice(view: BotView, choice: PendingChoice): Intent | undefined {
    const target = shrinkTarget(view);
    const r = choice.request;
    if (r?.type === "select") {
      const option = target && r.options.find((o) => o.eligible && o.instanceId === target.id);
      return option ? { type: "resolve_pending_choice", accept: true, selectedOptionIds: [option.id] } : undefined;
    }
    if (r && r.type !== "confirm") return undefined;
    return target ? { type: "resolve_pending_choice", accept: true } : { type: "resolve_pending_choice", accept: false };
  },
};
