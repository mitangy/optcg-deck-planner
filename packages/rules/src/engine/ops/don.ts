/**
 * DON!! ops: add, give, set active, rest, return and move.
 */
import { getCardDef } from "../../cards/definitions.js";
import { evalValue, playerRestricted, powerOf } from "../queries.js";
import { activeDon, attachDon, placeDonFromDeck, returnDonById, returnDonToDeck } from "../zones.js";
import { dispatchEvent } from "../triggers.js";
import { type OpTable, seatOf } from "./shared.js";

export const donOps: OpTable<"add_don" | "give_don" | "set_don_active" | "rest_don" | "return_don" | "move_don"> = {
  add_don(effect, { sim, state, frame, ctx }) {
    const seat = seatOf(frame, effect.player);
    const placed = placeDonFromDeck(state.players[seat], evalValue(state, ctx, effect.count), effect.rested);
    if (placed) sim.events.push({ type: "don_placed", seat, count: placed });
    return "next";
  },
  give_don(effect, { sim, state, frame, targetsOf }) {
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
  },
  set_don_active(effect, { state, frame }) {
    const p = state.players[frame.seat];
    if (playerRestricted(state, frame.seat, "cannot_set_don_active")) return "next";
    if (getCardDef(frame.sourceDefId).type === "character" && playerRestricted(state, frame.seat, "cannot_set_don_active_by_character_effects")) return "next";
    let n = effect.count;
    for (const d of p.costArea) if (n > 0 && d.rested) { d.rested = false; n -= 1; }
    return "next";
  },
  rest_don(effect, { state, frame }) {
    const p = state.players[seatOf(frame, effect.player)];
    let n = effect.count;
    for (const d of activeDon(p)) if (n-- > 0) d.rested = true;
    return "next";
  },
  return_don(effect, { state, frame, ctx, targetsOf }) {
    const seat = seatOf(frame, effect.player);
    const returned = effect.target
      ? targetsOf(effect.target).filter((l) => l.zone === "don").reduce((n, l) => n + (returnDonById(state, l.seat, l.id) ? 1 : 0), 0)
      : returnDonToDeck(state, seat, evalValue(state, ctx, effect.count ?? 1), Boolean(effect.activeOnly));
    if (returned) dispatchEvent(state, "don_returned", { seat, count: returned });
    return "next";
  },
  move_don(effect, { sim, state, targetsOf }) {
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
  },
};
