import type { Intent } from "../net/protocol";

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
