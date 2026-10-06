import type { Intent } from "../net/protocol";
import { splitCardActions } from "./cardActions";
import { filterIntentsForSelection } from "./intentFilter";

/**
 * Lower rank wins. Answering an attack ("take the hit" / no block) comes
 * before ending the turn, and keeping the opening hand is the mulligan's
 * advance action. Everything else is a contextual action.
 */
function rank(intent: Intent): number | null {
  switch (intent.type) {
    // The choice prompts own these answers; they are never the primary action.
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

/**
 * Picks the one "advance the game" intent that lives in the bar's fixed
 * thumb-zone slot. `rest` keeps every other intent in its original order.
 */
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

/**
 * What the desktop board dock shows: the primary, plus every other phase-wide
 * action (the mulligan's redraw, a trigger to resolve, a second pass) as extra
 * buttons. The defend tray owns its own choices, so it leaves no extras.
 */
export function dockIntents(
  intents: Intent[],
  opts: { defending?: boolean } = {},
): { primary: Intent | null; extras: Intent[] } {
  const { primary, rest } = splitPrimaryIntent(intents);
  if (opts.defending) return { primary, extras: [] };
  return { primary, extras: splitCardActions(filterIntentsForSelection(rest, {})).bar };
}
