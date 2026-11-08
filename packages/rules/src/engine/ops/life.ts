/**
 * Life-area ops: direct damage, deck/hand/trash/deck transfers, face-up/down and Life look-and-reorder.
 */
import type { ChoiceOption } from "../../types.js";
import { evalValue, lifeFaceGroups, playerRestricted } from "../queries.js";
import { otherSeat, putCard, takeCard } from "../zones.js";
import { moveToZone, takeLifeToHand } from "../zoneActions.js";
import { promptPrefix, pushChoice } from "../vm.js";
import { type OpTable, seatOf } from "./shared.js";
import { B, CB } from "../../effects/bindings.js";

export const lifeOps: OpTable<"damage" | "deck_to_life" | "life_to_hand" | "trash_life" | "life_face" | "life_to_deck" | "look_life"> = {
  damage(effect, { state, frame }) {
    state.steps.unshift({ kind: "effect_damage", seat: seatOf(frame, effect.player), remaining: effect.count });
    return "next";
  },
  deck_to_life(effect, { sim, state, frame }) {
    const seat = seatOf(frame, effect.player);
    const p = state.players[seat];
    for (let i = 0; i < effect.count && p.deck.length; i += 1) {
      const entry = takeCard(state, { seat, zone: "deck", index: 0, id: p.zoneInstanceIds.deck[0]!, defId: p.deck[0]! });
      putCard(state, seat, "life", entry, { position: "top", faceUp: Boolean(effect.faceUp) });
      sim.events.push({ type: "life_added", seat, defId: entry.defId, source: "deck_top", ...(effect.faceUp ? { faceUp: true } : {}) });
    }
    return "next";
  },
  life_to_hand(effect, { sim, state, frame }) {
    const seat = seatOf(frame, effect.player);
    if (effect.position === "top_or_bottom" && state.players[seat].life.length > 1 && frame.bindings[B.lifeEnd] === undefined) {
      pushChoice(sim, frame, { seat: frame.seat, kind: "effect", optional: false, prompt: `${promptPrefix(frame)} — take from the top or bottom of Life?`, request: { type: "mode", options: [{ id: "m0", label: "Top", eligible: true }, { id: "m1", label: "Bottom", eligible: true }] }, bindings: { [CB.bind]: B.lifeEnd, [CB.repeat]: "1" } });
      return "wait";
    }
    const bottom = frame.bindings[B.lifeEnd] === 1 || effect.position === "bottom";
    delete frame.bindings[B.lifeEnd];
    if (seat === frame.seat && playerRestricted(state, seat, "cannot_add_life_to_hand_by_effect")) return "next";
    for (let i = 0; i < effect.count; i += 1) if (!takeLifeToHand(sim, seat, bottom)) break;
    return "next";
  },
  trash_life(effect, { sim, state, frame, ctx }) {
    const seat = seatOf(frame, effect.player);
    const p = state.players[seat];
    if (effect.position === "top_or_bottom" && p.life.length > 1 && frame.bindings[B.lifeEnd] === undefined) {
      pushChoice(sim, frame, { seat: frame.seat, kind: "effect", optional: false, prompt: `${promptPrefix(frame)} — trash from the top or bottom of Life?`, request: { type: "mode", options: [{ id: "m0", label: "Top", eligible: true }, { id: "m1", label: "Bottom", eligible: true }] }, bindings: { [CB.bind]: B.lifeEnd, [CB.repeat]: "1" } });
      return "wait";
    }
    const fromBottom = frame.bindings[B.lifeEnd] === 1;
    delete frame.bindings[B.lifeEnd];
    const n = evalValue(state, ctx, effect.count);
    for (let i = 0; i < n && p.life.length; i += 1) {
      const index = fromBottom ? p.life.length - 1 : 0;
      moveToZone(sim, { seat, zone: "life", index, id: p.zoneInstanceIds.life[index]!, defId: p.life[index]! }, "trash");
    }
    return "next";
  },
  life_face(effect, { sim, state, frame }) {
    const p = state.players[seatOf(frame, effect.player)];
    if (effect.position && effect.position !== "top") {
      const groups = lifeFaceGroups(p.faceUpLife, effect.count, effect.faceUp, effect.position);
      if (groups.length > 1 && frame.bindings[B.lifeFace] === undefined) {
        const options = groups.map((g, k) => ({ id: `m${k}`, label: effect.position === "top_or_bottom" ? (g[0] === 0 ? "Top" : "Bottom") : `Life card ${g[0]! + 1}${g[0] === 0 ? " (top)" : g[0] === p.life.length - 1 ? " (bottom)" : ""}`, eligible: true }));
        pushChoice(sim, frame, { seat: frame.seat, kind: "effect", optional: false, prompt: `${promptPrefix(frame)} — turn which Life card face-${effect.faceUp ? "up" : "down"}?`, request: { type: "mode", options }, bindings: { [CB.bind]: B.lifeFace, [CB.repeat]: "1" } });
        return "wait";
      }
      const chosen = groups[Number(frame.bindings[B.lifeFace] ?? 0)] ?? [];
      delete frame.bindings[B.lifeFace];
      for (const i of chosen) p.faceUpLife[i] = effect.faceUp;
      return "next";
    }
    for (let i = 0; i < Math.min(effect.count, p.life.length); i += 1) p.faceUpLife[i] = effect.faceUp;
    return "next";
  },
  life_to_deck(effect, { sim, state, frame }) {
    const seat = seatOf(frame, effect.player);
    const p = state.players[seat];
    for (let i = 0; i < effect.count && p.life.length; i += 1) moveToZone(sim, { seat, zone: "life", index: 0, id: p.zoneInstanceIds.life[0]!, defId: p.life[0]! }, "deck", { position: "top" });
    return "next";
  },
  look_life(effect, { sim, state, frame }) {
    if (effect.player === "any" && frame.bindings[B.lifeSeat] === undefined) {
      pushChoice(sim, frame, { seat: frame.seat, kind: "effect", optional: false, prompt: `${promptPrefix(frame)} — look at whose Life cards?`, request: { type: "mode", options: [{ id: "m0", label: "Your Life", eligible: true }, { id: "m1", label: "Opponent's Life", eligible: true }] }, bindings: { [CB.bind]: B.lifeSeat, [CB.repeat]: "1" } });
      return "wait";
    }
    const seat = effect.player === "any" ? (frame.bindings[B.lifeSeat] === 1 ? otherSeat(frame.seat) : frame.seat) : seatOf(frame, effect.player);
    delete frame.bindings[B.lifeSeat];
    const p = state.players[seat];
    const count = Math.min(effect.count, p.life.length);
    if (count === 0) return "next";
    const bindings: Record<string, string> = { __lifeOrder: JSON.stringify({ seat, count, topOrBottom: effect.rest === "top_or_bottom" }) };
    const options: ChoiceOption[] = [];
    for (let i = 0; i < count; i += 1) { bindings[`o${i}`] = p.zoneInstanceIds.life[i]!; options.push({ id: `o${i}`, defId: p.life[i]!, zone: "life", ownerSeat: seat, eligible: true }); }
    pushChoice(sim, frame, { seat: frame.seat, kind: "effect", optional: false, prompt: `${promptPrefix(frame)} — ${effect.prompt ?? (effect.rest === "top_or_bottom" ? "place each card at the top or bottom of the Life cards" : "reorder the Life cards (first = top)")}.`, request: { type: "order", options, destination: "life", allowTopOrBottom: effect.rest === "top_or_bottom" }, bindings, privateToSeat: frame.seat, optionCount: count });
    return "wait";
  },
};
