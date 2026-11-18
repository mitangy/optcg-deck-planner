import type { Intent } from "../../net/protocol";
import type { EndTurnConfirm, ResponseStops } from "../../settings";

export type EndTurnWarning = { reason: string | null };

function distinct(intents: readonly Intent[], type: string, key: string): number {
  const ids = new Set<unknown>();
  for (const i of intents) if (i.type === type) ids.add((i as Record<string, unknown>)[key]);
  return ids.size;
}

export function endTurnLeftovers(intents: readonly Intent[]): string | null {
  const don = distinct(intents, "give_don", "donId");
  const attackers = distinct(intents, "declare_attack", "attackerId");
  // The short form, so the armed button label still fits the rail.
  if (don > 0 && attackers > 0) return `${don} DON!! + ${attackers} atk`;
  if (don > 0) return `${don} DON!! unused`;
  if (attackers > 0) return `${attackers} ${attackers === 1 ? "attacker" : "attackers"} ready`;
  return null;
}

export function endTurnWarning(
  mode: EndTurnConfirm,
  intents: readonly Intent[],
): EndTurnWarning | null {
  if (mode === "never") return null;
  if (mode === "always") return { reason: null };
  const reason = endTurnLeftovers(intents);
  return reason ? { reason } : null;
}

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

export type CounterOutlook = {
  gap: number | null;
  values: readonly (number | null)[];
};

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

// A beat so the attack registers.
export const AUTO_PASS_BEAT_MS = 450;
export const AUTO_PASS_HUMAN_MIN_MS = 1500;
export const AUTO_PASS_HUMAN_MAX_MS = 3500;

export function autoPassDelayMs(vsHuman: boolean, random: () => number = Math.random): number {
  if (!vsHuman) return AUTO_PASS_BEAT_MS;
  return Math.round(AUTO_PASS_HUMAN_MIN_MS + random() * (AUTO_PASS_HUMAN_MAX_MS - AUTO_PASS_HUMAN_MIN_MS));
}

export function scheduleAutoPass(
  fire: () => void,
  vsHuman: boolean,
  random: () => number = Math.random,
): () => void {
  const id = setTimeout(fire, autoPassDelayMs(vsHuman, random));
  return () => clearTimeout(id);
}
