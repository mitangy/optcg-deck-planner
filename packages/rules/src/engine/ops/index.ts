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
