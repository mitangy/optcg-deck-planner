/**
 * Zone actions shared by effects and procedure: K.O., playing cards, life to hand.
 */
import { abilitiesFor } from "../cards/abilities.js";
import { getCardDef } from "../cards/definitions.js";
import type { InstanceId, ResolutionFrame, Seat } from "../types.js";
import { isNegated, playerRestricted } from "./queries.js";
import { type Located, alloc, isOnField, locate, putCard, putOnField, takeCard } from "./zones.js";
import type { Sim } from "./sim.js";
import { abilityGateOpen, dispatchEvent, queueWindow } from "./triggers.js";
import { B } from "../effects/bindings.js";

const MAX_CHARACTERS = 5;

// ---------------------------------------------------------------------------
// Zone actions shared by effects and procedure
// ---------------------------------------------------------------------------

export interface RemovalCause {
  /** Seat whose effect caused the removal; undefined for battle / rules. */
  byEffectOf?: Seat;
  battle?: boolean;
}

/** K.O. a Character (no replacement check). Queues On K.O. and "when K.O.'d" triggers. */
export function performKo(sim: Sim, loc: Located, cause: RemovalCause): void {
  const { state } = sim;
  // [DON!! xN] gates read the card as it was on the field: leaving returns its DON!!.
  const live = loc.card ?? locate(state, loc.id)?.card;
  const koed = live ? { ...live, attachedDonIds: [...live.attachedDonIds] } : undefined;
  // A negated Character cannot activate [On K.O.] or "when K.O.'d"; negation reads the field, so judge it before the card leaves (#1001).
  const negated = live ? isNegated(state, live) : false;
  const entry = takeCard(state, loc);
  putCard(state, loc.seat, "trash", entry);
  sim.events.push({ type: "character_ko", seat: loc.seat, defId: entry.defId });
  if (!negated) queueWindow(state, "on_ko", loc.seat, entry, koed ? { card: koed } : {});
  for (const ability of negated ? [] : abilitiesFor(entry.defId)) {
    const et = ability.eventTrigger;
    if (ability.trigger !== "on_event" || et?.event !== "self_ko") continue;
    if (et.byOpponentEffect && (cause.byEffectOf == null || cause.byEffectOf === loc.seat)) continue;
    if (et.byEffect && cause.byEffectOf == null) continue;
    if (!abilityGateOpen(state, loc.seat, { ...entry, ...(koed ? { card: koed } : {}) }, ability)) continue;
    state.triggerQueue.push({ id: alloc(state, "trig"), seat: loc.seat, sourceInstanceId: entry.id, sourceDefId: entry.defId, abilityId: ability.id, window: "on_event", batch: state.triggerBatch });
  }
  // A K.O. by an effect is also a removal from the field by that effect: one occurrence, so each ability queues once.
  dispatchEvent(state, cause.byEffectOf != null ? ["character_ko", "character_removed_by_effect"] : "character_ko", { seat: loc.seat, card: entry, ...(cause.byEffectOf != null ? { byEffectOf: cause.byEffectOf } : {}) });
  if (loc.zone === "character") dispatchEvent(state, "character_left_field", { seat: loc.seat, card: entry, ...(cause.byEffectOf != null ? { byEffectOf: cause.byEffectOf } : {}) });
}

/**
 * Play a card onto its owner's field without paying its cost. A 6th Character
 * first asks its owner to trash one Character; the card waits in `resolving`.
 */
export function beginPlay(sim: Sim, seat: Seat, entry: { id: InstanceId; defId: string }, rested: boolean, costPaid = 0, fromZone = "hand"): void {
  const { state } = sim;
  const def = getCardDef(entry.defId);
  if (def.type === "character" && state.players[seat].characters.length >= MAX_CHARACTERS) {
    putCard(state, seat, "resolving", entry);
    const frame: ResolutionFrame = { id: alloc(state, "frame"), seat, sourceInstanceId: entry.id, sourceDefId: entry.defId, abilityId: "__trash_for_space", window: "rule", operationIndex: 0, bindings: { [B.rested]: rested, [B.costPaid]: costPaid, [B.fromZone]: fromZone }, program: "trash_for_space" };
    state.resolutionFrames.push(frame);
    return;
  }
  finishPlay(sim, seat, entry, rested, costPaid, fromZone);
}

export function finishPlay(sim: Sim, seat: Seat, entry: { id: InstanceId; defId: string }, rested: boolean, costPaid: number, fromZone = "hand"): void {
  const { state } = sim;
  const playedRested = rested || (getCardDef(entry.defId).type === "character" && playerRestricted(state, seat, "characters_played_rested"));
  const card = putOnField(state, seat, entry, { rested: playedRested }, sim.events);
  sim.events.push({ type: "card_played", seat, defId: entry.defId, instanceId: card.id, costPaid });
  if (!playerRestricted(state, seat, "on_play_negated")) queueWindow(state, "on_play", seat, card);
  dispatchEvent(state, "character_played", { seat, card: entry, fromZone });
}

export function moveToZone(sim: Sim, loc: Located, zone: "hand" | "deck" | "trash" | "life", opts: { position?: "top" | "bottom"; faceUp?: boolean } = {}): void {
  const { state } = sim;
  const leaving = loc.zone === "character";
  // Visibility is judged before the move (face-up Life indexes shift once taken).
  const fromPublic = isOnField(loc) || loc.zone === "trash" || (loc.zone === "life" && Boolean(state.players[loc.seat].faceUpLife[loc.index]));
  const toPublic = zone === "trash" || (zone === "life" && Boolean(opts.faceUp));
  // Neither end public → only the owner may learn the card (projectGameEvents
  // hides it from everyone else). Deck / face-down Life on both ends → nobody.
  const hidden = !fromPublic && !toPublic;
  const ownerKnows = !hidden || loc.zone === "hand" || zone === "hand";
  const entry = takeCard(state, loc);
  putCard(state, loc.seat, zone, entry, opts);
  if (leaving) dispatchEvent(state, "character_left_field", { seat: loc.seat, card: entry });
  sim.events.push({ type: "card_moved", seat: loc.seat, defId: ownerKnows ? entry.defId : "HIDDEN", from: loc.zone, to: zone, ...(hidden ? { hidden: true } : {}) });
  if (loc.zone === "life") dispatchEvent(state, "life_removed", { seat: loc.seat, card: entry });
  if (loc.zone === "hand" && zone === "trash") dispatchEvent(state, "card_trashed_from_hand", { seat: loc.seat, card: entry });
}

export function takeLifeToHand(sim: Sim, seat: Seat, fromBottom = false, byRules = false): boolean {
  const p = sim.state.players[seat];
  if (!p.life.length) return false;
  const index = fromBottom ? p.life.length - 1 : 0;
  // "Your face-up Life cards are placed at the bottom of your deck instead of being added to your hand, according to the rules."
  if (byRules && p.faceUpLife[index] && abilitiesFor(p.leader.defId).some((a) => (a.statics ?? []).some((st) => st.s === "deck_rule" && st.rule === "face_up_life_to_deck_bottom"))) {
    moveToZone(sim, { seat, zone: "life", index, id: p.zoneInstanceIds.life[index]!, defId: p.life[index]! }, "deck", { position: "bottom" });
    return true;
  }
  moveToZone(sim, { seat, zone: "life", index, id: p.zoneInstanceIds.life[index]!, defId: p.life[index]! }, "hand");
  dispatchEvent(sim.state, "life_to_hand", { seat });
  return true;
}
