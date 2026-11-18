import type { Intent, Seat, TimerMessage } from "../../net/protocol";

const STEP = 1000;

// The attacker wins ties, so the defender must end strictly higher; Counters come in whole thousands, so round up.
export function defenseGap(attackerPower: number, defenderPower: number): number {
  const deficit = attackerPower - defenderPower;
  if (deficit < 0) return 0;
  return (Math.floor(deficit / STEP) + 1) * STEP;
}

export function defenseStatus(
  attackerPower: number,
  defenderPower: number,
  staged: number,
): { gap: number; remaining: number; safe: boolean } {
  const gap = defenseGap(attackerPower, defenderPower);
  const remaining = defenseGap(attackerPower, defenderPower + staged);
  return { gap, remaining, safe: remaining === 0 };
}

export function stagedCounterTotal(
  stagedIds: readonly string[],
  valueById: ReadonlyMap<string, number>,
): number {
  let total = 0;
  for (const id of new Set(stagedIds)) total += valueById.get(id) ?? 0;
  return total;
}

// Highest index first: every card leaving the hand shifts the later slots down by one. Staging can be stale, so cards are found by id.
export function resolveStagedCounters(
  intents: readonly Intent[],
  hand: readonly { id: string }[],
  stagedIds: readonly string[],
): Intent[] {
  const byIndex = new Map<number, Extract<Intent, { type: "counter_from_hand" }>>();
  for (const i of intents) {
    if (i.type === "counter_from_hand" && typeof i.handIndex === "number") {
      byIndex.set(i.handIndex, i);
    }
  }
  const picked: Extract<Intent, { type: "counter_from_hand" }>[] = [];
  for (const id of new Set(stagedIds)) {
    const idx = hand.findIndex((c) => c.id === id);
    const intent = idx >= 0 ? byIndex.get(idx) : undefined;
    if (intent) picked.push(intent);
  }
  return picked.sort((a, b) => b.handIndex - a.handIndex);
}

export function clockFraction(
  timer: TimerMessage | null | undefined,
  now: number,
  youSeat: Seat,
): number | null {
  if (!timer) return null;
  let left: number | null = null;
  if (timer.seatSeconds && timer.clockSeat === youSeat && timer.clockEndsAt != null) {
    left = (timer.clockEndsAt - now) / (timer.seatSeconds * 1000);
  } else if (timer.turnSeconds && timer.turnEndsAt != null) {
    left = (timer.turnEndsAt - now) / (timer.turnSeconds * 1000);
  }
  return left == null ? null : Math.min(1, Math.max(0, left));
}
