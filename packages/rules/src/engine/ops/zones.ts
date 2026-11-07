/**
 * Zone-moving and removal ops: draw, K.O., rest/activate, return to hand/deck/trash/Life, play, Event activation, mill, shuffle.
 */
import { abilitiesFor } from "../../cards/abilities.js";
import { getCardDef } from "../../cards/definitions.js";
import { evalValue, playerRestricted } from "../queries.js";
import { drawCards, isOnField, locate, putCard, takeCard } from "../state.js";
import { dispatchEvent, startAbility } from "../triggers.js";
import { beginPlay, moveToZone, performKo } from "../zoneActions.js";
import { promptPrefix, pushChoice } from "../vm.js";
import { removedByEffect } from "../replacement.js";
import { type OpTable, forEachTarget, seatOf } from "./shared.js";
import { B, CB, V, getBinding, recordAffected } from "../../effects/bindings.js";

export const zonesOps: OpTable<"draw" | "ko" | "rest" | "to_hand" | "to_deck" | "to_trash" | "to_life" | "play" | "activate" | "activate_event" | "mill" | "shuffle"> = {
  draw(effect, { sim, state, frame, ctx }) {
    const seat = seatOf(frame, effect.player);
    if (playerRestricted(state, seat, "cannot_draw_by_effect")) return "next";
    const drawn = drawCards(state, seat, evalValue(state, ctx, effect.count), sim.events);
    if (drawn > 0) dispatchEvent(state, "card_drawn_by_effect", { seat, count: drawn, byEffectOf: frame.seat });
    return "next";
  },
  ko(effect, { sim, frame, targetsOf }) {
    const targets = targetsOf(effect.target).filter((l) => l.zone === "character" || l.zone === "stage");
    return forEachTarget(sim, frame, targets, "ko", (loc) => performKo(sim, loc, { byEffectOf: frame.seat }));
  },
  rest(effect, { sim, state, frame, targetsOf }) {
    const all = targetsOf(effect.target);
    if (getBinding(frame, B.actTargets) === undefined) for (const loc of all) if (loc.zone === "don") { const d = state.players[loc.seat].costArea.find((x) => x.id === loc.id); if (d) d.rested = true; }
    return forEachTarget(sim, frame, all.filter((l) => l.zone !== "don" && l.card && isOnField(l)), "rest", (loc) => {
      if (!loc.card) return;
      if (!loc.card.rested) {
        loc.card.rested = true;
        dispatchEvent(state, "self_rested", { seat: loc.seat, card: loc, byEffectOf: frame.seat });
        if (loc.zone === "character") dispatchEvent(state, "character_rested", { seat: loc.seat, card: loc, byEffectOf: frame.seat });
      }
    });
  },
  to_hand(effect, { sim, state, frame, targetsOf }) {
    const targets = targetsOf(effect.target);
    return forEachTarget(sim, frame, targets, "return", (loc) => {
      if (loc.zone === "leader" || loc.zone === "hand") return;
      if (isOnField(loc)) {
        removedByEffect(state, frame, loc);
        dispatchEvent(state, "character_returned", { seat: loc.seat, card: loc, byEffectOf: frame.seat });
      }
      moveToZone(sim, loc, "hand");
      if (loc.zone !== "deck" && loc.zone !== "life") sim.events.push({ type: "card_revealed", seat: loc.seat, defId: loc.defId });
    });
  },
  to_deck(effect, { sim, state, frame, targetsOf }) {
    if (effect.position === "top_or_bottom" && frame.bindings[B.end] === undefined) {
      if (targetsOf(effect.target).length === 0) return "next";
      pushChoice(sim, frame, { seat: frame.seat, kind: "effect", optional: false, prompt: `${promptPrefix(frame)} — place at the top or bottom of the deck?`, request: { type: "mode", options: [{ id: "m0", label: "Top", eligible: true }, { id: "m1", label: "Bottom", eligible: true }] }, bindings: { [CB.bind]: B.end, [CB.repeat]: "1" } });
      return "wait";
    }
    const position: "top" | "bottom" = effect.position === "top_or_bottom" ? (frame.bindings[B.end] === 0 ? "top" : "bottom") : effect.position;
    const targets = targetsOf(effect.target);
    return forEachTarget(sim, frame, targets, "remove", (loc) => {
      if (loc.zone === "leader") return;
      removedByEffect(state, frame, loc);
      moveToZone(sim, loc, "deck", { position });
    }, () => { delete frame.bindings[B.end]; });
  },
  to_trash(effect, { sim, state, frame, targetsOf }) {
    const targets = targetsOf(effect.target);
    return forEachTarget(sim, frame, targets, frame.program === "trash_for_space" ? null : "remove", (loc) => {
      if (loc.zone === "leader" || loc.zone === "trash") return;
      if (frame.program === "trash_for_space") sim.events.push({ type: "character_trashed_for_space", seat: loc.seat, defId: loc.defId });
      else removedByEffect(state, frame, loc);
      moveToZone(sim, loc, "trash");
    });
  },
  to_life(effect, { sim, state, frame, targetsOf }) {
    if (effect.position === "top_or_bottom" && frame.bindings[B.end] === undefined) {
      if (targetsOf(effect.target).length === 0) return "next";
      pushChoice(sim, frame, { seat: frame.seat, kind: "effect", optional: false, prompt: `${promptPrefix(frame)} — place at the top or bottom of the Life cards?`, request: { type: "mode", options: [{ id: "m0", label: "Top", eligible: true }, { id: "m1", label: "Bottom", eligible: true }] }, bindings: { [CB.bind]: B.end, [CB.repeat]: "1" } });
      return "wait";
    }
    const lifePosition: "top" | "bottom" = effect.position === "top_or_bottom" ? (frame.bindings[B.end] === 0 ? "top" : "bottom") : effect.position;
    // Same path as to_hand / to_deck / to_trash, so "cannot be removed by effects" and removal replacements apply (#656).
    return forEachTarget(sim, frame, targetsOf(effect.target), "remove", (loc) => {
      if (loc.zone === "leader" || loc.zone === "life") return;
      removedByEffect(state, frame, loc);
      const entry = takeCard(state, loc);
      putCard(state, loc.seat, "life", entry, { position: lifePosition, faceUp: effect.faceUp });
      if (loc.zone === "character") dispatchEvent(state, "character_left_field", { seat: loc.seat, card: entry, byEffectOf: frame.seat });
      sim.events.push({ type: "life_added", seat: loc.seat, defId: entry.defId, source: loc.zone === "hand" ? "hand" : loc.zone === "trash" ? "trash" : loc.zone === "deck" ? "deck_top" : "field", ...(effect.faceUp ? { faceUp: true } : {}) });
    }, () => { delete frame.bindings[B.end]; });
  },
  play(effect, { sim, state, frame, targetsOf }) {
    frame.bindings[V.affected] = [];
    for (const target of targetsOf(effect.target)) {
      // Re-locate: an earlier play shifted the indexes of the zone it left.
      const loc = locate(state, target.id);
      if (!loc || isOnField(loc)) continue;
      const def = getCardDef(loc.defId);
      if (def.type !== "character" && def.type !== "stage") continue;
      if (def.type === "character" && playerRestricted(state, loc.seat, "cannot_play_characters", loc)) continue;
      if (abilitiesFor(loc.defId).some((a) => (a.statics ?? []).some((st) => st.s === "deck_rule" && st.rule === "not_playable_by_effect"))) continue;
      const entry = takeCard(state, loc);
      beginPlay(sim, loc.seat, entry, Boolean(effect.rested), 0, loc.zone);
      recordAffected(frame, entry.id);
    }
    return "next";
  },
  activate(effect, { state, frame, targetsOf }) {
    // Like `play`: "set X as active. If you do, ..." gates on the cards this step actually set active.
    frame.bindings[V.affected] = [];
    for (const loc of targetsOf(effect.target)) {
      if (loc.zone === "don") {
        const d = state.players[loc.seat].costArea.find((x) => x.id === loc.id);
        if (d) { d.rested = false; recordAffected(frame, loc.id); }
        continue;
      }
      if (loc.card && isOnField(loc)) { loc.card.rested = false; recordAffected(frame, loc.id); }
    }
    return "next";
  },
  activate_event(effect, { sim, state, frame, targetsOf }) {
    const loc = targetsOf(effect.target).find((l) => (l.zone === "hand" || l.zone === "trash") && getCardDef(l.defId).type === "event");
    if (!loc) return "next";
    const main = abilitiesFor(loc.defId).find((a) => a.trigger === "main");
    const entry = takeCard(state, loc);
    putCard(state, loc.seat, "resolving", entry);
    // Activating the Event card from the hand is an Event activation (OP15-046 Sabo); using only its [Main] effect from the trash is not (EB03-031 Reiju).
    if (loc.zone === "hand") dispatchEvent(state, "event_activated", { seat: loc.seat, card: entry });
    frame.operationIndex += 1;
    if (!main) { const again = locate(state, entry.id)!; putCard(state, loc.seat, "trash", takeCard(state, again)); return "jumped"; }
    startAbility(sim, loc.seat, entry, main, "main");
    return "interrupt";
  },
  mill(effect, { sim, state, frame, ctx }) {
    const seat = seatOf(frame, effect.player);
    const p = state.players[seat];
    const n = evalValue(state, ctx, effect.count);
    const trashed: string[] = [];
    for (let i = 0; i < n && p.deck.length; i += 1) {
      trashed.push(p.zoneInstanceIds.deck[0]!);
      moveToZone(sim, { seat, zone: "deck", index: 0, id: p.zoneInstanceIds.deck[0]!, defId: p.deck[0]! }, "trash");
    }
    if (effect.bind) frame.bindings[effect.bind] = trashed;
    return "next";
  },
  shuffle(effect, { sim, state, frame }) {
    const p = state.players[seatOf(frame, effect.player)];
    const cards = sim.rng.shuffle(p.deck.map((defId, i) => ({ defId, id: p.zoneInstanceIds.deck[i]! })));
    p.deck = cards.map((c) => c.defId);
    p.zoneInstanceIds.deck = cards.map((c) => c.id);
    return "next";
  },
};
