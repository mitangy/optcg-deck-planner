import type { Intent } from "../net/protocol";
import type { EndTurnConfirm, ResponseStops } from "../settings";

/** What the armed End turn button says; `reason` is null when the setting asks unconditionally. */
export type EndTurnWarning = { reason: string | null };

function distinct(intents: readonly Intent[], type: string, key: string): number {
  const ids = new Set<unknown>();
  for (const i of intents) if (i.type === type) ids.add(i[key]);
  return ids.size;
}

/**
 * What you would leave on the table by ending now, from the legal intents:
 * active DON!! that could still be attached (a `give_don` exists for each
 * active DON!!) and ready Leaders / Characters that could still attack. An
 * optional Activate: Main or a play you could not use anyway does not count.
 */
export function endTurnLeftovers(intents: readonly Intent[]): string | null {
  const don = distinct(intents, "give_don", "donId");
  const attackers = distinct(intents, "declare_attack", "attackerId");
  // Both: the short form, so the armed button label still fits the rail.
  if (don > 0 && attackers > 0) return `${don} DON!! + ${attackers} atk`;
  if (don > 0) return `${don} DON!! unused`;
  if (attackers > 0) return `${attackers} ${attackers === 1 ? "attacker" : "attackers"} ready`;
  return null;
}

/** Whether End turn should ask for a second tap, and why (null = end right away). */
export function endTurnWarning(
  mode: EndTurnConfirm,
  intents: readonly Intent[],
): EndTurnWarning | null {
  if (mode === "never") return null;
  if (mode === "always") return { reason: null };
  const reason = endTurnLeftovers(intents);
  return reason ? { reason } : null;
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
