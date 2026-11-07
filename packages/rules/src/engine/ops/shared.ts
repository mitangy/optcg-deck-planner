/**
 * Shared pieces of the leaf op handlers: the handler types, target resolution
 * and the removal loop.
 */
import type { Effect, ReplacementEvent, Target } from "../../effects/types.js";
import type { MatchState, ResolutionFrame, Seat } from "../../types.js";
import { candidates } from "../queries.js";
import { findReplacement, pushReplacementFrame, removalBlocked } from "../replacement.js";
import { locateDon } from "../donLocation.js";
import type { Sim } from "../sim.js";
import { type Located, isOnField, locate, otherSeat } from "../state.js";
import { type ExecResult, frameCtx } from "../vm.js";

/** One variant of the effect DSL, by its `do` tag. */
export type OpEffect<K extends Effect["do"]> = Extract<Effect, { do: K }>;

/** What every leaf op handler receives besides the effect. */
export interface OpCtx {
  sim: Sim;
  state: MatchState;
  frame: ResolutionFrame;
  ctx: ReturnType<typeof frameCtx>;
  targetsOf: (target: Target) => Located[];
}

export type OpHandler<K extends Effect["do"]> = (effect: OpEffect<K>, c: OpCtx) => ExecResult;
/** Handlers for the subset `K` of ops; `OPS` in `./index.ts` joins the subsets into the full table. */
export type OpTable<K extends Effect["do"]> = { [P in K]: OpHandler<P> };

export function resolveTargets(state: MatchState, frame: ResolutionFrame, target: Target): Located[] {
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
export function forEachTarget(sim: Sim, frame: ResolutionFrame, targets: Located[], kind: "ko" | "return" | "remove" | "rest" | null, apply: (loc: Located) => void, done?: () => void): ExecResult {
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

export function seatOf(frame: ResolutionFrame, rel: "you" | "opponent" | undefined): Seat {
  return rel === "opponent" ? otherSeat(frame.seat) : frame.seat;
}

export function durationLabel(duration: string): "turn" | "battle" | "other" {
  return duration === "turn" ? "turn" : duration === "battle" ? "battle" : "other";
}
