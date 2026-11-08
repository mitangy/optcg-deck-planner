/**
 * Information ops: reveal a card or the top of a zone.
 */
import { type OpTable, seatOf } from "./shared.js";

export const infoOps: OpTable<"reveal_top" | "reveal"> = {
  reveal_top(effect, { sim, state, frame }) {
    const seat = seatOf(frame, effect.player);
    const p = state.players[seat];
    const zone = effect.zone ?? "deck";
    if (p[zone].length) { frame.bindings[effect.bind] = [p.zoneInstanceIds[zone][0]!]; sim.events.push({ type: "card_revealed", seat, defId: p[zone][0]! }); }
    else frame.bindings[effect.bind] = [];
    return "next";
  },
  reveal(effect, { sim, state, targetsOf }) {
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
  },
};
