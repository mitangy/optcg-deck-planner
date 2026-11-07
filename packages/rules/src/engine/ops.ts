/**
 * Leaf effect actions: runs one op through the handler table in `./ops/`.
 */
import type { Effect } from "../effects/types.js";
import type { ResolutionFrame } from "../types.js";
import { withActing, type Sim } from "./sim.js";
import { type ExecResult, frameCtx } from "./vm.js";
import { OPS } from "./ops/index.js";
import { type OpCtx, type OpHandler, resolveTargets } from "./ops/shared.js";

export function execAct(sim: Sim, frame: ResolutionFrame, effect: Effect): ExecResult {
  return withActing({ seat: frame.seat, id: frame.sourceInstanceId, defId: frame.sourceDefId }, () => execActInner(sim, frame, effect));
}

function execActInner(sim: Sim, frame: ResolutionFrame, effect: Effect): ExecResult {
  const { state } = sim;
  const c: OpCtx = { sim, state, frame, ctx: frameCtx(frame), targetsOf: (target) => resolveTargets(state, frame, target) };
  // OPS is exhaustive per op; TypeScript cannot correlate `effect` with `OPS[effect.do]`, hence the cast.
  return (OPS[effect.do] as OpHandler<Effect["do"]>)(effect, c);
}
