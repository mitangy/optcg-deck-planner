/**
 * The op handler table. Adding a variant to `Effect["do"]` without a handler in one of the
 * groups below fails `tsc` here (see docs/duel-client/EFFECTS.md, "Adding a new effect op").
 */
import type { Effect } from "../../effects/types.js";
import { donOps } from "./don.js";
import { flowOps } from "./flow.js";
import { infoOps } from "./info.js";
import { lifeOps } from "./life.js";
import { loweredOps } from "./lowered.js";
import { modifiersOps } from "./modifiers.js";
import type { OpHandler } from "./shared.js";
import { zonesOps } from "./zones.js";

export const OPS: { [K in Effect["do"]]: OpHandler<K> } = {
  ...zonesOps,
  ...modifiersOps,
  ...donOps,
  ...lifeOps,
  ...infoOps,
  ...flowOps,
  ...loweredOps,
};
