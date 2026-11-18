import type { Intent } from "../../net/protocol";
import { splitCardActions } from "../input/cardActions";
import { filterIntentsForSelection } from "./intentFilter";

function rank(intent: Intent): number | null {
  switch (intent.type) {
    case "resolve_pending_choice":
    case "order_pending_effects":
      return null;
    case "pass_counter":
      return 0;
    case "pass_block":
      return 1;
    case "end_turn":
      return 2;
    case "mulligan":
      return intent.doMulligan === false ? 3 : null;
    default:
      return null;
  }
}

export function splitPrimaryIntent(intents: Intent[]): {
  primary: Intent | null;
  rest: Intent[];
} {
  let best = -1;
  let bestRank = Infinity;
  intents.forEach((intent, i) => {
    const r = rank(intent);
    if (r != null && r < bestRank) {
      best = i;
      bestRank = r;
    }
  });
  if (best < 0) return { primary: null, rest: intents };
  return { primary: intents[best], rest: intents.filter((_, i) => i !== best) };
}

export function dockIntents(
  intents: Intent[],
  opts: { defending?: boolean } = {},
): { primary: Intent | null; extras: Intent[] } {
  const { primary, rest } = splitPrimaryIntent(intents);
  if (opts.defending) return { primary, extras: [] };
  return { primary, extras: splitCardActions(filterIntentsForSelection(rest, {})).bar };
}
