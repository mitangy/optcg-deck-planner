/**
 * Ops that change game flow rather than a zone or modifier: win, extra turn, invoke, redirect the attack, no-op.
 */
import { abilitiesFor } from "../../cards/abilities.js";
import { alloc } from "../zones.js";
import type { OpTable } from "./shared.js";

export const flowOps: OpTable<"nothing" | "win" | "extra_turn" | "invoke" | "redirect_attack"> = {
  nothing() { return "next"; },
  win(_effect, { sim, state, frame }) {
    state.winner = frame.seat;
    state.winReason = "card_effect";
    state.phase = "game_over";
    sim.events.push({ type: "game_over", winner: frame.seat, reason: "card_effect" });
    return "next";
  },
  extra_turn(_effect, { state, frame }) { state.extraTurns.push(frame.seat); return "next"; },
  invoke(effect, { state, frame }) {
    const ability = abilitiesFor(frame.sourceDefId).find((a) => a.trigger === effect.window);
    if (!ability) return "next";
    frame.operationIndex += 1;
    state.resolutionFrames.push({ id: alloc(state, "frame"), seat: frame.seat, sourceInstanceId: frame.sourceInstanceId, sourceDefId: frame.sourceDefId, abilityId: ability.id, window: effect.window, operationIndex: 0, bindings: {}, program: "ability" });
    return "interrupt";
  },
  redirect_attack(effect, { state, targetsOf }) {
    const b = state.battle;
    const loc = targetsOf(effect.target)[0];
    if (b && loc && loc.seat !== b.attackerSeat && (loc.zone === "leader" || loc.zone === "character")) b.target = loc.zone === "leader" ? { kind: "leader" } : { kind: "character", instanceId: loc.id };
    return "next";
  },
};
