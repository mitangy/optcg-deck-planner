import type { Intent } from "../net/protocol";
import type { EndTurnConfirm } from "../settings";

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
