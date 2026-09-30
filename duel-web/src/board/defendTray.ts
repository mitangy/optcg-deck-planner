import type { Intent, Seat, TimerMessage } from "../net/protocol";

/** Counter values (and the power a defender needs) come in steps of 1000. */
const STEP = 1000;

/**
 * Extra power the defender needs to survive an attack. The attacker wins
 * ties, so the defender must end strictly higher; the answer is rounded up to
 * the next 1000 because Counter cards come in whole thousands. 0 = already safe.
 */
export function defenseGap(attackerPower: number, defenderPower: number): number {
  const deficit = attackerPower - defenderPower;
  if (deficit < 0) return 0;
  return (Math.floor(deficit / STEP) + 1) * STEP;
}

/** What the staged counters leave: the gap before and after adding them. */
export function defenseStatus(
  attackerPower: number,
  defenderPower: number,
  staged: number,
): { gap: number; remaining: number; safe: boolean } {
  const gap = defenseGap(attackerPower, defenderPower);
  const remaining = defenseGap(attackerPower, defenderPower + staged);
  return { gap, remaining, safe: remaining === 0 };
}

/** Power added by the staged cards. Unknown values add 0; a card counts once. */
export function stagedCounterTotal(
  stagedIds: readonly string[],
  valueById: ReadonlyMap<string, number>,
): number {
  let total = 0;
  for (const id of new Set(stagedIds)) total += valueById.get(id) ?? 0;
  return total;
}

/**
 * The `counter_from_hand` intents to send for the staged hand cards, in send
 * order. Cards are found by id in the latest hand (staging can be stale), and
 * every card that leaves the hand shifts the slots after it down by one, so
 * the highest index goes first to keep the remaining indexes valid.
 */
export function resolveStagedCounters(
  intents: readonly Intent[],
  hand: readonly { id: string }[],
  stagedIds: readonly string[],
): Intent[] {
  const byIndex = new Map<number, Intent>();
  for (const i of intents) {
    if (i.type === "counter_from_hand" && typeof i.handIndex === "number") {
      byIndex.set(i.handIndex, i);
    }
  }
  const picked: Intent[] = [];
  for (const id of new Set(stagedIds)) {
    const idx = hand.findIndex((c) => c.id === id);
    const intent = idx >= 0 ? byIndex.get(idx) : undefined;
    if (intent) picked.push(intent);
  }
  return picked.sort((a, b) => (b.handIndex as number) - (a.handIndex as number));
}

/**
 * How much of the response clock is left (1 = full, 0 = out of time), or null
 * when no clock applies. Your own chess clock counts only while it runs for
 * you; otherwise the turn clock, when the room has one.
 */
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
