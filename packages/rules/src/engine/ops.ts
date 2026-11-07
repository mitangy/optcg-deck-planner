/**
 * Leaf effect actions: target resolution and the per-op executor.
 */
import { abilitiesFor } from "../cards/abilities.js";
import { getCardDef } from "../cards/definitions.js";
import type { Effect, ReplacementEvent, Target } from "../effects/types.js";
import type { ChoiceOption, MatchState, ResolutionFrame, Seat } from "../types.js";
import { addModifier, expiryFor } from "./modifiers.js";
import { basePowerOf, candidates, evalValue, lifeFaceGroups, playerRestricted, powerOf } from "./queries.js";
import { type Located, activeDon, alloc, attachDon, drawCards, isOnField, locate, otherSeat, placeDonFromDeck, putCard, returnDonById, returnDonToDeck, takeCard } from "./state.js";
import { withActing, type Sim } from "./sim.js";
import { dispatchEvent, startAbility } from "./triggers.js";
import { beginPlay, moveToZone, performKo, takeLifeToHand } from "./zoneActions.js";
import { type ExecResult, frameCtx, promptPrefix, pushChoice } from "./vm.js";
import { findReplacement, pushReplacementFrame, removalBlocked, removedByEffect } from "./replacement.js";
import { locateDon } from "./donLocation.js";

function resolveTargets(state: MatchState, frame: ResolutionFrame, target: Target): Located[] {
  const ctx = frameCtx(frame);
  switch (target.ref) {
    case "self": { const loc = locate(state, frame.sourceInstanceId); return loc ? [loc] : []; }
    case "leader": { const p = state.players[target.player === "you" ? frame.seat : otherSeat(frame.seat)]; return [{ seat: target.player === "you" ? frame.seat : otherSeat(frame.seat), zone: "leader", index: 0, id: p.leader.id, defId: p.leader.defId, card: p.leader }]; }
    case "var": {
      const v = frame.bindings[target.name];
      const ids = Array.isArray(v) ? v : typeof v === "string" ? [v] : [];
      return ids.map((id) => locate(state, id) ?? locateDon(state, id)).filter((l): l is Located => l != null);
    }
    case "all": return candidates(state, ctx, target.selector);
    case "battle": {
      const b = state.battle;
      if (!b) return [];
      const attacker = locate(state, b.attackerId);
      const defenderId = b.target.kind === "leader" ? state.players[otherSeat(b.attackerSeat)].leader.id : b.target.instanceId;
      const defender = locate(state, defenderId);
      const pick = (loc: Located | null) => (loc ? [loc] : []);
      if (target.role === "attacker") return pick(attacker);
      if (target.role === "defender") return pick(defender);
      const own = attacker?.seat === frame.seat ? attacker : defender;
      const opp = attacker?.seat === frame.seat ? defender : attacker;
      return pick(target.role === "own_battler" ? own : opp);
    }
    case "event_card": { const id = frame.bindings._event; const loc = typeof id === "string" ? locate(state, id) : null; return loc ? [loc] : []; }
    case "choose": return [];
  }
}
/** Apply a removal to each target in order; may pause for replacement prompts. */
function forEachTarget(sim: Sim, frame: ResolutionFrame, targets: Located[], kind: "ko" | "return" | "remove" | "rest" | null, apply: (loc: Located) => void, done?: () => void): ExecResult {
  const { state } = sim;
  if (!Array.isArray(frame.bindings._actTargets)) frame.bindings._affected = [];
  const record = (loc: Located) => { const list = Array.isArray(frame.bindings._affected) ? frame.bindings._affected : []; frame.bindings._affected = [...list, loc.id]; };
  if (!Array.isArray(frame.bindings._actTargets)) frame.bindings._actTargets = targets.map((t) => t.id);
  const ids = frame.bindings._actTargets as string[];
  let index = typeof frame.bindings._actIndex === "number" ? frame.bindings._actIndex : 0;
  for (; index < ids.length; index += 1) {
    const loc = locate(state, ids[index]!);
    if (!loc) continue;
    // A replaced removal never happens, even when the replacement moved the
    // target itself off the field (Marco K.O.'ing himself instead).
    const replKey = `_repl:${loc.id}`;
    if (frame.bindings[replKey] === true) continue;
    if (kind && isOnField(loc) && loc.zone !== "leader") {
      if (removalBlocked(state, loc, frame.seat, kind, locate(state, frame.sourceInstanceId))) continue;
      const byOpponent = frame.seat !== loc.seat;
      if (frame.bindings[replKey] === undefined) {
        const events: ReplacementEvent[] = kind === "rest"
          ? (byOpponent ? ["rested_by_opponent_effect"] : [])
          : kind === "ko" ? ["ko", "ko_by_effect", "removed", ...(byOpponent ? ["removed_by_opponent_effect" as const] : [])] : ["removed", ...(byOpponent ? ["removed_by_opponent_effect" as const] : [])];
        const hit = events.length ? findReplacement(state, loc, events, byOpponent) : null;
        if (hit) {
          frame.bindings._actIndex = index;
          frame.bindings._actEvents = events;
          frame.bindings._actByOpponent = byOpponent;
          pushReplacementFrame(sim, hit, loc.id, frame.id);
          return "interrupt";
        }
      }
    }
    apply(loc);
    record(loc);
  }
  for (const key of Object.keys(frame.bindings)) if (key === "_actTargets" || key === "_actIndex" || key === "_actEvents" || key === "_actByOpponent" || key.startsWith("_repl:")) delete frame.bindings[key];
  done?.();
  return "next";
}

function seatOf(frame: ResolutionFrame, rel: "you" | "opponent" | undefined): Seat {
  return rel === "opponent" ? otherSeat(frame.seat) : frame.seat;
}

function durationLabel(duration: string): "turn" | "battle" | "other" {
  return duration === "turn" ? "turn" : duration === "battle" ? "battle" : "other";
}

export function execAct(sim: Sim, frame: ResolutionFrame, effect: Effect): ExecResult {
  return withActing({ seat: frame.seat, id: frame.sourceInstanceId, defId: frame.sourceDefId }, () => execActInner(sim, frame, effect));
}

function execActInner(sim: Sim, frame: ResolutionFrame, effect: Effect): ExecResult {
  const { state } = sim;
  const ctx = frameCtx(frame);
  const targetsOf = (target: Target) => resolveTargets(state, frame, target);
  switch (effect.do) {
    case "nothing": return "next";
    case "draw": {
      const seat = seatOf(frame, effect.player);
      if (playerRestricted(state, seat, "cannot_draw_by_effect")) return "next";
      const drawn = drawCards(state, seat, evalValue(state, ctx, effect.count), sim.events);
      if (drawn > 0) dispatchEvent(state, "card_drawn_by_effect", { seat, count: drawn, byEffectOf: frame.seat });
      return "next";
    }
    case "ko": {
      const targets = targetsOf(effect.target).filter((l) => l.zone === "character" || l.zone === "stage");
      return forEachTarget(sim, frame, targets, "ko", (loc) => performKo(sim, loc, { byEffectOf: frame.seat }));
    }
    case "rest": {
      const all = targetsOf(effect.target);
      if (!Array.isArray(frame.bindings._actTargets)) for (const loc of all) if (loc.zone === "don") { const d = state.players[loc.seat].costArea.find((x) => x.id === loc.id); if (d) d.rested = true; }
      return forEachTarget(sim, frame, all.filter((l) => l.zone !== "don" && l.card && isOnField(l)), "rest", (loc) => {
        if (!loc.card) return;
        if (!loc.card.rested) {
          loc.card.rested = true;
          dispatchEvent(state, "self_rested", { seat: loc.seat, card: loc, byEffectOf: frame.seat });
          if (loc.zone === "character") dispatchEvent(state, "character_rested", { seat: loc.seat, card: loc, byEffectOf: frame.seat });
        }
      });
    }
    case "activate": {
      // Like `play`: "set X as active. If you do, ..." gates on the cards this step actually set active.
      frame.bindings._affected = [];
      for (const loc of targetsOf(effect.target)) {
        if (loc.zone === "don") {
          const d = state.players[loc.seat].costArea.find((x) => x.id === loc.id);
          if (d) { d.rested = false; frame.bindings._affected = [...(frame.bindings._affected as string[]), loc.id]; }
          continue;
        }
        if (loc.card && isOnField(loc)) { loc.card.rested = false; frame.bindings._affected = [...(frame.bindings._affected as string[]), loc.id]; }
      }
      return "next";
    }
    case "to_hand": {
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
    }
    case "to_deck": {
      if (effect.position === "top_or_bottom" && frame.bindings._end === undefined) {
        if (targetsOf(effect.target).length === 0) return "next";
        pushChoice(sim, frame, { seat: frame.seat, kind: "effect", optional: false, prompt: `${promptPrefix(frame)} — place at the top or bottom of the deck?`, request: { type: "mode", options: [{ id: "m0", label: "Top", eligible: true }, { id: "m1", label: "Bottom", eligible: true }] }, bindings: { __bind: "_end", __repeat: "1" } });
        return "wait";
      }
      const position: "top" | "bottom" = effect.position === "top_or_bottom" ? (frame.bindings._end === 0 ? "top" : "bottom") : effect.position;
      const targets = targetsOf(effect.target);
      return forEachTarget(sim, frame, targets, "remove", (loc) => {
        if (loc.zone === "leader") return;
        removedByEffect(state, frame, loc);
        moveToZone(sim, loc, "deck", { position });
      }, () => { delete frame.bindings._end; });
    }
    case "to_trash": {
      const targets = targetsOf(effect.target);
      return forEachTarget(sim, frame, targets, frame.program === "trash_for_space" ? null : "remove", (loc) => {
        if (loc.zone === "leader" || loc.zone === "trash") return;
        if (frame.program === "trash_for_space") sim.events.push({ type: "character_trashed_for_space", seat: loc.seat, defId: loc.defId });
        else removedByEffect(state, frame, loc);
        moveToZone(sim, loc, "trash");
      });
    }
    case "to_life": {
      if (effect.position === "top_or_bottom" && frame.bindings._end === undefined) {
        if (targetsOf(effect.target).length === 0) return "next";
        pushChoice(sim, frame, { seat: frame.seat, kind: "effect", optional: false, prompt: `${promptPrefix(frame)} — place at the top or bottom of the Life cards?`, request: { type: "mode", options: [{ id: "m0", label: "Top", eligible: true }, { id: "m1", label: "Bottom", eligible: true }] }, bindings: { __bind: "_end", __repeat: "1" } });
        return "wait";
      }
      const lifePosition: "top" | "bottom" = effect.position === "top_or_bottom" ? (frame.bindings._end === 0 ? "top" : "bottom") : effect.position;
      // Same path as to_hand / to_deck / to_trash, so "cannot be removed by effects" and removal replacements apply (#656).
      return forEachTarget(sim, frame, targetsOf(effect.target), "remove", (loc) => {
        if (loc.zone === "leader" || loc.zone === "life") return;
        removedByEffect(state, frame, loc);
        const entry = takeCard(state, loc);
        putCard(state, loc.seat, "life", entry, { position: lifePosition, faceUp: effect.faceUp });
        if (loc.zone === "character") dispatchEvent(state, "character_left_field", { seat: loc.seat, card: entry, byEffectOf: frame.seat });
        sim.events.push({ type: "life_added", seat: loc.seat, defId: entry.defId, source: loc.zone === "hand" ? "hand" : loc.zone === "trash" ? "trash" : loc.zone === "deck" ? "deck_top" : "field", ...(effect.faceUp ? { faceUp: true } : {}) });
      }, () => { delete frame.bindings._end; });
    }
    case "play": {
      frame.bindings._affected = [];
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
        frame.bindings._affected = [...(Array.isArray(frame.bindings._affected) ? frame.bindings._affected : []), entry.id];
      }
      return "next";
    }
    case "power": case "cost": case "base_power": {
      const amount = evalValue(state, ctx, effect.do === "base_power" ? effect.value : effect.amount);
      for (const loc of targetsOf(effect.target)) {
        if (!loc.card || !isOnField(loc)) continue;
        const expires = expiryFor(state, frame.seat, effect.duration);
        addModifier(state, frame.seat, frame.sourceInstanceId, { kind: "card", id: loc.id }, effect.do === "power" ? { type: "power", amount } : effect.do === "cost" ? { type: "cost", amount } : { type: "base_power", value: amount }, expires);
        if (effect.do === "power") sim.events.push({ type: "power_buff_applied", seat: loc.seat, targetDefId: loc.defId, amount, duration: durationLabel(effect.duration) });
      }
      return "next";
    }
    case "set_power": {
      const value = evalValue(state, ctx, effect.value);
      for (const loc of targetsOf(effect.target)) if (loc.card && isOnField(loc)) addModifier(state, frame.seat, frame.sourceInstanceId, { kind: "card", id: loc.id }, { type: "set_power", value }, expiryFor(state, frame.seat, effect.duration));
      return "next";
    }
    case "set_cost": {
      const value = evalValue(state, ctx, effect.value);
      for (const loc of targetsOf(effect.target)) if (loc.card && isOnField(loc)) addModifier(state, frame.seat, frame.sourceInstanceId, { kind: "card", id: loc.id }, { type: "set_cost", value }, expiryFor(state, frame.seat, effect.duration));
      return "next";
    }
    case "damage": {
      state.steps.unshift({ kind: "effect_damage", seat: seatOf(frame, effect.player), remaining: effect.count });
      return "next";
    }
    case "activate_event": {
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
    }
    case "keyword": {
      for (const loc of targetsOf(effect.target)) if (loc.card && isOnField(loc)) addModifier(state, frame.seat, frame.sourceInstanceId, { kind: "card", id: loc.id }, { type: "keyword", keyword: effect.keyword }, expiryFor(state, frame.seat, effect.duration));
      return "next";
    }
    case "restrict": {
      for (const loc of targetsOf(effect.target)) {
        if (loc.zone === "don" && effect.restriction === "no_refresh") { const d = state.players[loc.seat].costArea.find((x) => x.id === loc.id); if (d) d.noRefresh = true; continue; }
        if (!loc.card || !isOnField(loc)) continue;
        const expires = effect.restriction === "no_refresh" ? { kind: "next_refresh" as const, seat: loc.seat } : expiryFor(state, frame.seat, effect.duration);
        addModifier(state, frame.seat, frame.sourceInstanceId, { kind: "card", id: loc.id }, { type: "restrict", restriction: effect.restriction, ...(effect.value != null ? { value: effect.value } : {}), ...(effect.attribute ? { attribute: effect.attribute } : {}), ...(effect.filter ? { filter: effect.filter } : {}) }, expires);
      }
      return "next";
    }
    case "player_restrict": {
      addModifier(state, frame.seat, frame.sourceInstanceId, { kind: "player", seat: seatOf(frame, effect.player) }, { type: "player_restrict", restriction: effect.restriction, ...(effect.filter ? { filter: effect.filter } : {}) }, expiryFor(state, frame.seat, effect.duration));
      return "next";
    }
    case "negate": {
      for (const loc of targetsOf(effect.target)) if (loc.card && isOnField(loc)) addModifier(state, frame.seat, frame.sourceInstanceId, { kind: "card", id: loc.id }, { type: "negate" }, expiryFor(state, frame.seat, effect.duration));
      return "next";
    }
    case "add_don": {
      const seat = seatOf(frame, effect.player);
      const placed = placeDonFromDeck(state.players[seat], evalValue(state, ctx, effect.count), effect.rested);
      if (placed) sim.events.push({ type: "don_placed", seat, count: placed });
      return "next";
    }
    case "give_don": {
      const donSeat = seatOf(frame, effect.player);
      for (const loc of targetsOf(effect.target)) {
        if (!loc.card || !(loc.zone === "leader" || loc.zone === "character") || loc.seat !== donSeat) continue;
        for (let i = 0; i < effect.count; i += 1) {
          const don = attachDon(state, donSeat, loc.card, effect.donState);
          if (!don) break;
          sim.events.push({ type: "don_given", seat: donSeat, donId: don.id, targetId: loc.id, targetDefId: loc.defId, newPower: powerOf(state, loc.seat, loc.card) });
          dispatchEvent(state, "don_given", { seat: loc.seat, card: loc });
        }
      }
      return "next";
    }
    case "set_don_active": {
      const p = state.players[frame.seat];
      if (playerRestricted(state, frame.seat, "cannot_set_don_active")) return "next";
      if (getCardDef(frame.sourceDefId).type === "character" && playerRestricted(state, frame.seat, "cannot_set_don_active_by_character_effects")) return "next";
      let n = effect.count;
      for (const d of p.costArea) if (n > 0 && d.rested) { d.rested = false; n -= 1; }
      return "next";
    }
    case "rest_don": {
      const p = state.players[seatOf(frame, effect.player)];
      let n = effect.count;
      for (const d of activeDon(p)) if (n-- > 0) d.rested = true;
      return "next";
    }
    case "return_don": {
      const seat = seatOf(frame, effect.player);
      const returned = effect.target
        ? targetsOf(effect.target).filter((l) => l.zone === "don").reduce((n, l) => n + (returnDonById(state, l.seat, l.id) ? 1 : 0), 0)
        : returnDonToDeck(state, seat, evalValue(state, ctx, effect.count ?? 1), Boolean(effect.activeOnly));
      if (returned) dispatchEvent(state, "don_returned", { seat, count: returned });
      return "next";
    }
    case "move_don": {
      const dest = targetsOf(effect.to)[0];
      const sources = targetsOf(effect.from).filter((l) => l.card && (l.zone === "leader" || l.zone === "character") && l.id !== dest?.id);
      let remaining = effect.count;
      // Round-robin so "2 total" can come from different cards.
      let moved = true;
      while (remaining > 0 && moved) {
        moved = false;
        for (const src of sources) {
          if (remaining <= 0 || !src.card!.attachedDonIds.length) continue;
          const p = state.players[src.seat];
          const donId = src.card!.attachedDonIds[src.card!.attachedDonIds.length - 1]!;
          const don = p.attachedDons.find((d) => d.id === donId);
          if (!don) continue;
          if (dest && dest.zone === "don") {
            src.card!.attachedDonIds.pop();
            p.attachedDons = p.attachedDons.filter((d) => d.id !== donId);
            don.attachedTo = null;
            don.rested = true;
            p.costArea.push(don);
          } else if (dest?.card && dest.seat === src.seat && (dest.zone === "leader" || dest.zone === "character")) {
            src.card!.attachedDonIds.pop();
            don.attachedTo = dest.id;
            dest.card.attachedDonIds.push(don.id);
            sim.events.push({ type: "don_given", seat: src.seat, donId: don.id, targetId: dest.id, targetDefId: dest.defId, newPower: powerOf(state, dest.seat, dest.card) });
            // Moving a given DON!! to another card "gives" it (OP02 Q&A: Garp triggers for DON!! given by effects).
            dispatchEvent(state, "don_given", { seat: dest.seat, card: dest });
          } else continue;
          remaining -= 1;
          moved = true;
        }
      }
      return "next";
    }
    case "swap_base_power": {
      const cards = [...targetsOf(effect.target), ...(effect.with ? targetsOf(effect.with) : [])].filter((l) => l.card && isOnField(l));
      if (cards.length !== 2) return "next";
      const [a, b] = cards as [Located, Located];
      const pa = basePowerOf(state, a.seat, a.card!);
      const pb = basePowerOf(state, b.seat, b.card!);
      const expires = expiryFor(state, frame.seat, effect.duration);
      addModifier(state, frame.seat, frame.sourceInstanceId, { kind: "card", id: a.id }, { type: "base_power", value: pb }, expires);
      addModifier(state, frame.seat, frame.sourceInstanceId, { kind: "card", id: b.id }, { type: "base_power", value: pa }, expires);
      return "next";
    }
    case "deck_to_life": {
      const seat = seatOf(frame, effect.player);
      const p = state.players[seat];
      for (let i = 0; i < effect.count && p.deck.length; i += 1) {
        const entry = takeCard(state, { seat, zone: "deck", index: 0, id: p.zoneInstanceIds.deck[0]!, defId: p.deck[0]! });
        putCard(state, seat, "life", entry, { position: "top", faceUp: Boolean(effect.faceUp) });
        sim.events.push({ type: "life_added", seat, defId: entry.defId, source: "deck_top", ...(effect.faceUp ? { faceUp: true } : {}) });
      }
      return "next";
    }
    case "life_to_hand": {
      const seat = seatOf(frame, effect.player);
      if (effect.position === "top_or_bottom" && state.players[seat].life.length > 1 && frame.bindings._lifeEnd === undefined) {
        pushChoice(sim, frame, { seat: frame.seat, kind: "effect", optional: false, prompt: `${promptPrefix(frame)} — take from the top or bottom of Life?`, request: { type: "mode", options: [{ id: "m0", label: "Top", eligible: true }, { id: "m1", label: "Bottom", eligible: true }] }, bindings: { __bind: "_lifeEnd", __repeat: "1" } });
        return "wait";
      }
      const bottom = frame.bindings._lifeEnd === 1 || effect.position === "bottom";
      delete frame.bindings._lifeEnd;
      if (seat === frame.seat && playerRestricted(state, seat, "cannot_add_life_to_hand_by_effect")) return "next";
      for (let i = 0; i < effect.count; i += 1) if (!takeLifeToHand(sim, seat, bottom)) break;
      return "next";
    }
    case "trash_life": {
      const seat = seatOf(frame, effect.player);
      const p = state.players[seat];
      if (effect.position === "top_or_bottom" && p.life.length > 1 && frame.bindings._lifeEnd === undefined) {
        pushChoice(sim, frame, { seat: frame.seat, kind: "effect", optional: false, prompt: `${promptPrefix(frame)} — trash from the top or bottom of Life?`, request: { type: "mode", options: [{ id: "m0", label: "Top", eligible: true }, { id: "m1", label: "Bottom", eligible: true }] }, bindings: { __bind: "_lifeEnd", __repeat: "1" } });
        return "wait";
      }
      const fromBottom = frame.bindings._lifeEnd === 1;
      delete frame.bindings._lifeEnd;
      const n = evalValue(state, ctx, effect.count);
      for (let i = 0; i < n && p.life.length; i += 1) {
        const index = fromBottom ? p.life.length - 1 : 0;
        moveToZone(sim, { seat, zone: "life", index, id: p.zoneInstanceIds.life[index]!, defId: p.life[index]! }, "trash");
      }
      return "next";
    }
    case "life_face": {
      const p = state.players[seatOf(frame, effect.player)];
      if (effect.position && effect.position !== "top") {
        const groups = lifeFaceGroups(p.faceUpLife, effect.count, effect.faceUp, effect.position);
        if (groups.length > 1 && frame.bindings._lifeFace === undefined) {
          const options = groups.map((g, k) => ({ id: `m${k}`, label: effect.position === "top_or_bottom" ? (g[0] === 0 ? "Top" : "Bottom") : `Life card ${g[0]! + 1}${g[0] === 0 ? " (top)" : g[0] === p.life.length - 1 ? " (bottom)" : ""}`, eligible: true }));
          pushChoice(sim, frame, { seat: frame.seat, kind: "effect", optional: false, prompt: `${promptPrefix(frame)} — turn which Life card face-${effect.faceUp ? "up" : "down"}?`, request: { type: "mode", options }, bindings: { __bind: "_lifeFace", __repeat: "1" } });
          return "wait";
        }
        const chosen = groups[Number(frame.bindings._lifeFace ?? 0)] ?? [];
        delete frame.bindings._lifeFace;
        for (const i of chosen) p.faceUpLife[i] = effect.faceUp;
        return "next";
      }
      for (let i = 0; i < Math.min(effect.count, p.life.length); i += 1) p.faceUpLife[i] = effect.faceUp;
      return "next";
    }
    case "mill": {
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
    }
    case "shuffle": {
      const p = state.players[seatOf(frame, effect.player)];
      const cards = sim.rng.shuffle(p.deck.map((defId, i) => ({ defId, id: p.zoneInstanceIds.deck[i]! })));
      p.deck = cards.map((c) => c.defId);
      p.zoneInstanceIds.deck = cards.map((c) => c.id);
      return "next";
    }
    case "win": {
      state.winner = frame.seat;
      state.winReason = "card_effect";
      state.phase = "game_over";
      sim.events.push({ type: "game_over", winner: frame.seat, reason: "card_effect" });
      return "next";
    }
    case "extra_turn": state.extraTurns.push(frame.seat); return "next";
    case "invoke": {
      const ability = abilitiesFor(frame.sourceDefId).find((a) => a.trigger === effect.window);
      if (!ability) return "next";
      frame.operationIndex += 1;
      state.resolutionFrames.push({ id: alloc(state, "frame"), seat: frame.seat, sourceInstanceId: frame.sourceInstanceId, sourceDefId: frame.sourceDefId, abilityId: ability.id, window: effect.window, operationIndex: 0, bindings: {}, program: "ability" });
      return "interrupt";
    }
    case "play_cost_reduction": {
      addModifier(state, frame.seat, frame.sourceInstanceId, { kind: "player", seat: frame.seat }, { type: "play_cost", filter: effect.filter, amount: effect.amount, ...(effect.next ? { once: true } : {}) }, expiryFor(state, frame.seat, effect.duration));
      return "next";
    }
    case "redirect_attack": {
      const b = state.battle;
      const loc = targetsOf(effect.target)[0];
      if (b && loc && loc.seat !== b.attackerSeat && (loc.zone === "leader" || loc.zone === "character")) b.target = loc.zone === "leader" ? { kind: "leader" } : { kind: "character", instanceId: loc.id };
      return "next";
    }
    case "reveal_top": {
      const seat = seatOf(frame, effect.player);
      const p = state.players[seat];
      const zone = effect.zone ?? "deck";
      if (p[zone].length) { frame.bindings[effect.bind] = [p.zoneInstanceIds[zone][0]!]; sim.events.push({ type: "card_revealed", seat, defId: p[zone][0]! }); }
      else frame.bindings[effect.bind] = [];
      return "next";
    }
    case "reveal": {
      for (const loc of targetsOf(effect.target)) {
        sim.events.push({ type: "card_revealed", seat: loc.seat, defId: loc.defId });
        // Revealed hand cards stay face up for the rest of the turn (#491).
        if (loc.zone === "hand") {
          const p = state.players[loc.seat];
          const ids = p.revealedHandIds ?? (p.revealedHandIds = []);
          if (!ids.includes(loc.id)) ids.push(loc.id);
        }
      }
      return "next";
    }
    case "look_life": {
      if (effect.player === "any" && frame.bindings._lifeSeat === undefined) {
        pushChoice(sim, frame, { seat: frame.seat, kind: "effect", optional: false, prompt: `${promptPrefix(frame)} — look at whose Life cards?`, request: { type: "mode", options: [{ id: "m0", label: "Your Life", eligible: true }, { id: "m1", label: "Opponent's Life", eligible: true }] }, bindings: { __bind: "_lifeSeat", __repeat: "1" } });
        return "wait";
      }
      const seat = effect.player === "any" ? (frame.bindings._lifeSeat === 1 ? otherSeat(frame.seat) : frame.seat) : seatOf(frame, effect.player);
      delete frame.bindings._lifeSeat;
      const p = state.players[seat];
      const count = Math.min(effect.count, p.life.length);
      if (count === 0) return "next";
      const bindings: Record<string, string> = { __lifeOrder: JSON.stringify({ seat, count, topOrBottom: effect.rest === "top_or_bottom" }) };
      const options: ChoiceOption[] = [];
      for (let i = 0; i < count; i += 1) { bindings[`o${i}`] = p.zoneInstanceIds.life[i]!; options.push({ id: `o${i}`, defId: p.life[i]!, zone: "life", ownerSeat: seat, eligible: true }); }
      pushChoice(sim, frame, { seat: frame.seat, kind: "effect", optional: false, prompt: `${promptPrefix(frame)} — ${effect.prompt ?? (effect.rest === "top_or_bottom" ? "place each card at the top or bottom of the Life cards" : "reorder the Life cards (first = top)")}.`, request: { type: "order", options, destination: "life", allowTopOrBottom: effect.rest === "top_or_bottom" }, bindings, privateToSeat: frame.seat, optionCount: count });
      return "wait";
    }
    case "attribute": {
      for (const loc of targetsOf(effect.target)) if (loc.card && isOnField(loc)) addModifier(state, frame.seat, frame.sourceInstanceId, { kind: "card", id: loc.id }, { type: "attribute", attribute: effect.attribute }, expiryFor(state, frame.seat, effect.duration));
      return "next";
    }
    case "life_to_deck": {
      const seat = seatOf(frame, effect.player);
      const p = state.players[seat];
      for (let i = 0; i < effect.count && p.life.length; i += 1) moveToZone(sim, { seat, zone: "life", index: 0, id: p.zoneInstanceIds.life[0]!, defId: p.life[0]! }, "deck", { position: "top" });
      return "next";
    }
    case "grant": {
      const abilityId = `${frame.abilityId.split("#")[0]}#${effect.ability}`;
      addModifier(state, frame.seat, frame.sourceInstanceId, { kind: "player", seat: frame.seat }, { type: "granted", abilityId, sourceDefId: frame.sourceDefId }, expiryFor(state, frame.seat, effect.duration));
      return "next";
    }
    case "choose_number": case "script": throw new Error(`Effect ${effect.do} must be compiled, not executed`);
    // Structural effects the compiler lowers to instructions; they never reach the leaf executor.
    case "seq": case "if": case "may": case "pay": case "choose_one": case "select": case "delay": case "discard": case "hand_to_deck": case "hand_to_life": case "look":
      throw new Error(`Effect ${effect.do} has no leaf executor`);
    default: {
      // Compile-time exhaustiveness: a new `Effect["do"]` that is not handled above fails tsc here.
      const unhandled: never = effect;
      throw new Error(`Effect ${(unhandled as Effect).do} has no leaf executor`);
    }
  }
}
