import { getCardDef } from "../cards/definitions.js";
import type { Intent } from "../types.js";
import type { Rng } from "../rng.js";
import type { BotLevel, BotView } from "./types.js";

/** Keep a hand with a playable curve: at least two Characters costing 4 or less. Easy keeps unless the rng says otherwise. */
export function chooseMulligan(view: BotView, level: BotLevel, rng: Rng): Intent {
  const legal = view.legalIntents;
  const mull = legal.find((i) => i.type === "mulligan" && i.doMulligan);
  const keep = legal.find((i) => i.type === "mulligan" && !i.doMulligan);
  if (!mull || !keep) return legal[0]!;
  if (level === "easy") return rng.next() < 0.25 ? mull : keep;
  const cheap = view.you.hand.filter((c) => {
    const def = getCardDef(c.defId);
    return def.type === "character" && def.cost <= 4;
  }).length;
  return cheap >= 2 ? keep : mull;
}
