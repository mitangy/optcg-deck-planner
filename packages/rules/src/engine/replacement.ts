/**
 * Replacement effects and removal protection.
 */
import { abilitiesFor, abilityById } from "../cards/abilities.js";
import type { Ability, ReplacementEvent } from "../effects/types.js";
import type { CardInstance, InstanceId, MatchState, ResolutionFrame, Seat } from "../types.js";
import { canPayCosts, ctxFor, filterMatches, hasRestriction, isNegated, protectedFromSource, selectorMatches } from "./queries.js";
import { type Located, alloc, fieldCards, isOnField, locate } from "./zones.js";
import { actingSource, type Sim } from "./sim.js";
import { abilityGateOpen, dispatchEvent, markUsed } from "./triggers.js";
import { B, V, getBinding, replKey } from "../effects/bindings.js";

export function removalBlocked(state: MatchState, loc: Located, byEffectOf: Seat, kind: "ko" | "return" | "remove" | "rest", source: Located | null = null): boolean {
  if (!loc.card || !isOnField(loc)) return false;
  const opp = byEffectOf !== loc.seat;
  if (kind === "ko" && (protectedFromSource(state, loc, "cannot_be_ko_by_effect_from", source, byEffectOf) || protectedFromSource(state, loc, "cannot_be_ko_by_opponent_effect_from", source, byEffectOf))) return true;
  if (kind === "rest" && protectedFromSource(state, loc, "cannot_be_rested_by_opponent_effect_from", source, byEffectOf)) return true;
  if (kind === "rest" && hasRestriction(state, loc.seat, loc.card, "cannot_be_rested")) return true;
  if (kind === "rest") return opp && hasRestriction(state, loc.seat, loc.card, "cannot_be_rested_by_opponent_effect");
  if (kind === "ko" && (hasRestriction(state, loc.seat, loc.card, "cannot_be_ko") || hasRestriction(state, loc.seat, loc.card, "cannot_be_ko_by_effect"))) return true;
  if (kind === "ko" && opp && hasRestriction(state, loc.seat, loc.card, "cannot_be_ko_by_opponent_effect")) return true;
  if (kind === "return" && opp && hasRestriction(state, loc.seat, loc.card, "cannot_be_returned_by_opponent_effect")) return true;
  if (opp && hasRestriction(state, loc.seat, loc.card, "cannot_be_removed_by_opponent_effect")) return true;
  return false;
}

/** Replacement abilities that can apply to `loc` for any of `events`. */
export function findReplacement(state: MatchState, loc: Located, events: ReplacementEvent[], byOpponent: boolean): { seat: Seat; card: CardInstance; ability: Ability } | null {
  const seat = loc.seat;
  for (const card of fieldCards(state.players[seat])) {
    if (isNegated(state, card)) continue;
    for (const ability of abilitiesFor(card.defId)) {
      const r = ability.replacement;
      if (ability.trigger !== "replacement" || !r || !(events.includes(r.event) || r.alsoEvents?.some((e) => events.includes(e)))) continue;
      if (r.byOpponent && !byOpponent) continue;
      if (r.sourceFilter) { const acting = actingSource(); const src = acting ? locate(state, acting.id) : null; if (!src || !filterMatches(state, ctxFor(seat, card), r.sourceFilter, src)) continue; }
      if (r.event === "removed_by_opponent_effect" && !byOpponent) continue;
      // Damage is dealt to the player: the replacement's source card is the card itself.
      if (!events.includes("life_damage") && (r.target === "self" ? card.id !== loc.id : !selectorMatches(state, ctxFor(seat, card), r.target, loc))) continue;
      if (!abilityGateOpen(state, seat, { id: card.id, defId: card.defId, card }, ability)) continue;
      if (r.instead.do === "pay" && !canPayCosts(state, ctxFor(seat, card), r.instead.costs)) continue;
      return { seat, card, ability };
    }
  }
  // Replacement abilities granted by an Event for a duration.
  for (const m of state.modifiers) {
    if (m.target.kind !== "player" || m.target.seat !== seat || m.effect.type !== "granted") continue;
    const ability = abilityById(m.effect.abilityId)?.ability;
    const r = ability?.replacement;
    if (!ability || !r || !(events.includes(r.event) || r.alsoEvents?.some((e) => events.includes(e)))) continue;
    const pseudo: CardInstance = { id: m.sourceId ?? m.id, defId: m.effect.sourceDefId, rested: false, attachedDonIds: [] };
    if (r.target === "self" || !selectorMatches(state, ctxFor(seat, pseudo), r.target, loc)) continue;
    if (r.instead.do === "pay" && !canPayCosts(state, ctxFor(seat, pseudo), r.instead.costs)) continue;
    return { seat, card: pseudo, ability };
  }
  return null;
}

/** "If you would take damage, ... instead" (Gloriosa EB05-052): a replacement available to `seat` right now. */
export function findDamageReplacement(state: MatchState, seat: Seat): { seat: Seat; card: CardInstance; ability: Ability } | null {
  const leader = locate(state, state.players[seat].leader.id);
  return leader ? findReplacement(state, leader, ["life_damage"], true) : null;
}

export function pushReplacementFrame(sim: Sim, hit: { seat: Seat; card: CardInstance; ability: Ability }, targetId: InstanceId, parentId?: string): void {
  const { state } = sim;
  markUsed(state, hit.card.id, hit.ability);
  state.resolutionFrames.push({ id: alloc(state, "frame"), seat: hit.seat, sourceInstanceId: hit.card.id, sourceDefId: hit.card.defId, abilityId: hit.ability.id, window: "replacement", operationIndex: 0, bindings: { [B.target]: targetId, [V.last]: [targetId], ...(parentId ? { [B.parent]: parentId } : {}) }, program: "replacement" });
}

/** An effect is about to move a Character off the field (to hand, deck, trash or Life): "removed from the field by an effect". */
export function removedByEffect(state: MatchState, frame: ResolutionFrame, loc: Located): void {
  if (loc.zone === "character") dispatchEvent(state, "character_removed_by_effect", { seat: loc.seat, card: loc, byEffectOf: frame.seat });
}

/**
 * An accepted replacement that protects a selector ("your Characters", not "this Character") covers every later
 * target of the same simultaneous removal it matches: one acceptance and one payment save them all (OP17-023, OP17-095 Q&A).
 */
export function coverBatch(state: MatchState, replFrame: ResolutionFrame, parent: ResolutionFrame): void {
  const r = abilityById(replFrame.abilityId)?.ability.replacement;
  const events = getBinding(parent, B.actEvents);
  const ids = getBinding(parent, B.actTargets);
  if (!r || r.target === "self" || !events || !ids) return;
  const byOpponent = getBinding(parent, B.actByOpponent) === true;
  if (!(events.includes(r.event) || r.alsoEvents?.some((e) => events.includes(e)))) return;
  if (r.byOpponent && !byOpponent) return;
  if (r.event === "removed_by_opponent_effect" && !byOpponent) return;
  const source = locate(state, replFrame.sourceInstanceId)?.card ?? { id: replFrame.sourceInstanceId, defId: replFrame.sourceDefId, rested: false, attachedDonIds: [] };
  const actIndex = getBinding(parent, B.actIndex);
  const from = actIndex !== undefined ? actIndex + 1 : ids.length;
  // Only a plain payment is shared by the batch; a replacement that acts on the protected card (Bege's "add it to Life",
  // Sabo's "-1000 to it") saves just the one it was used for (#593).
  if (r.instead.do !== "pay") return;
  for (const id of ids.slice(from)) {
    const key = replKey(id);
    const loc = locate(state, id);
    if (parent.bindings[key] !== undefined || !loc || !isOnField(loc) || loc.zone === "leader") continue;
    if (selectorMatches(state, ctxFor(replFrame.seat, source), r.target, loc)) parent.bindings[key] = true;
  }
}
