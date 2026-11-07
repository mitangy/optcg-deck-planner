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
import { B, REPL_PREFIX, V, getBinding, recordAffected, replKey, setBinding } from "../../effects/bindings.js";

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
    case "event_card": { const id = getBinding(frame, B.event); const loc = id !== undefined ? locate(state, id) : null; return loc ? [loc] : []; }
    case "choose": return [];
  }
}
/** Apply a removal to each target in order; may pause for replacement prompts. */
export function forEachTarget(sim: Sim, frame: ResolutionFrame, targets: Located[], kind: "ko" | "return" | "remove" | "rest" | null, apply: (loc: Located) => void, done?: () => void): ExecResult {
  const { state } = sim;
  if (getBinding(frame, B.actTargets) === undefined) frame.bindings[V.affected] = [];
  const record = (loc: Located) => recordAffected(frame, loc.id);
  if (getBinding(frame, B.actTargets) === undefined) setBinding(frame, B.actTargets, targets.map((t) => t.id));
  const ids = getBinding(frame, B.actTargets)!;
  let index = getBinding(frame, B.actIndex) ?? 0;
  for (; index < ids.length; index += 1) {
    const loc = locate(state, ids[index]!);
    if (!loc) continue;
    // A replaced removal never happens, even when the replacement moved the
    // target itself off the field (Marco K.O.'ing himself instead).
    const flag = replKey(loc.id);
    if (frame.bindings[flag] === true) continue;
    if (kind && isOnField(loc) && loc.zone !== "leader") {
      if (removalBlocked(state, loc, frame.seat, kind, locate(state, frame.sourceInstanceId))) continue;
      const byOpponent = frame.seat !== loc.seat;
      if (frame.bindings[flag] === undefined) {
        const events: ReplacementEvent[] = kind === "rest"
          ? (byOpponent ? ["rested_by_opponent_effect"] : [])
          : kind === "ko" ? ["ko", "ko_by_effect", "removed", ...(byOpponent ? ["removed_by_opponent_effect" as const] : [])] : ["removed", ...(byOpponent ? ["removed_by_opponent_effect" as const] : [])];
        const hit = events.length ? findReplacement(state, loc, events, byOpponent) : null;
        if (hit) {
          setBinding(frame, B.actIndex, index);
          setBinding(frame, B.actEvents, events);
          setBinding(frame, B.actByOpponent, byOpponent);
          pushReplacementFrame(sim, hit, loc.id, frame.id);
          return "interrupt";
        }
      }
    }
    apply(loc);
    record(loc);
  }
  for (const key of Object.keys(frame.bindings)) if (key === B.actTargets || key === B.actIndex || key === B.actEvents || key === B.actByOpponent || key.startsWith(REPL_PREFIX)) delete frame.bindings[key];
  done?.();
  return "next";
}

export function seatOf(frame: ResolutionFrame, rel: "you" | "opponent" | undefined): Seat {
  return rel === "opponent" ? otherSeat(frame.seat) : frame.seat;
}

export function durationLabel(duration: string): "turn" | "battle" | "other" {
  return duration === "turn" ? "turn" : duration === "battle" ? "battle" : "other";
}
