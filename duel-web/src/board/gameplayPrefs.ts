import type { Intent } from "../net/protocol";
import type { EndTurnConfirm, ResponseStops } from "../settings";

/** Intents that mean "you could still do something this turn". */
const TURN_ACTIONS = new Set([
  "play_card",
  "give_don",
  "declare_attack",
  "activate_ability",
  "activate_leader",
]);

/** Whether the End turn button should ask for a second tap. */
export function endTurnNeedsConfirm(mode: EndTurnConfirm, intents: readonly Intent[]): boolean {
  if (mode === "never") return false;
  if (mode === "always") return true;
  return intents.some((i) => TURN_ACTIONS.has(i.type));
}

/**
 * The Pass block / Pass counter to send for you when passing is the only
 * choice in that step (no blocker, no counter card you can pay for), else null.
 */
export function forcedDefensePass(intents: readonly Intent[]): Intent | null {
  const passBlock = intents.find((i) => i.type === "pass_block");
  if (passBlock && !intents.some((i) => i.type === "declare_block")) return passBlock;
  const passCounter = intents.find((i) => i.type === "pass_counter");
  if (
    passCounter &&
    !intents.some((i) => i.type === "counter_from_hand" || i.type === "counter_event")
  ) {
    return passCounter;
  }
  return null;
}

/** What the counter step looks like for the defender: the gap and each Counter card's value. */
export type CounterOutlook = {
  /** Extra power needed to survive (`defenseGap`), null when powers are unknown. */
  gap: number | null;
  /** Counter value of every usable `counter_from_hand` card; null = unknown. */
  values: readonly (number | null)[];
};

/**
 * The Pass to send for you under the "Stop for block and counter" setting, or
 * null to stop and let you decide. `auto` passes when passing is your only
 * option; `smart` also passes the counter step when all your Counter cards
 * together still fall short of the gap. [Counter] events and unknown Counter
 * values always stop you, since they might be a save.
 */
export function responseStopPass(
  mode: ResponseStops,
  intents: readonly Intent[],
  outlook?: CounterOutlook,
): Intent | null {
  if (mode === "always") return null;
  const forced = forcedDefensePass(intents);
  if (forced || mode !== "smart") return forced;
  const pass = intents.find((i) => i.type === "pass_counter");
  if (!pass || !outlook || outlook.gap == null) return null;
  if (intents.some((i) => i.type === "counter_event")) return null;
  let total = 0;
  for (const v of outlook.values) {
    if (v == null) return null;
    total += v;
  }
  return total < outlook.gap ? pass : null;
}
