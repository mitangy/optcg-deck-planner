import { describe, expect, it } from "vitest";
import type { Intent, TimerMessage } from "../net/protocol";
import {
  clockFraction,
  defenseGap,
  defenseStatus,
  resolveStagedCounters,
  stagedCounterTotal,
} from "./defendTray";

describe("defenseGap", () => {
  it("needs +1000 on equal power, because the attacker wins ties", () => {
    expect(defenseGap(5000, 5000)).toBe(1000);
  });

  it("needs nothing once the defender is strictly higher", () => {
    expect(defenseGap(5000, 5001)).toBe(0);
    expect(defenseGap(5000, 7000)).toBe(0);
  });

  it("counts a full step past the deficit, not just the deficit", () => {
    expect(defenseGap(7000, 5000)).toBe(3000);
  });

  it("rounds an in-between deficit up to the next 1000", () => {
    expect(defenseGap(6500, 5000)).toBe(2000);
    expect(defenseGap(5000, 4999)).toBe(1000);
  });
});

describe("defenseStatus", () => {
  it("shrinks the remaining gap by the staged counters", () => {
    expect(defenseStatus(7000, 5000, 0)).toEqual({ gap: 3000, remaining: 3000, safe: false });
    expect(defenseStatus(7000, 5000, 2000)).toEqual({ gap: 3000, remaining: 1000, safe: false });
  });

  it("is safe exactly when the staged power tops the attacker", () => {
    expect(defenseStatus(7000, 5000, 3000).safe).toBe(true);
    expect(defenseStatus(7000, 5000, 2000).safe).toBe(false);
  });
});

describe("stagedCounterTotal", () => {
  const values = new Map([
    ["a", 1000],
    ["b", 2000],
    ["c", 1000],
  ]);

  it("adds every staged card instead of taking the biggest", () => {
    expect(stagedCounterTotal(["a", "b", "c"], values)).toBe(4000);
  });

  it("counts a card staged twice once and unknown ids as nothing", () => {
    expect(stagedCounterTotal(["b", "b", "zzz"], values)).toBe(2000);
  });
});

describe("resolveStagedCounters", () => {
  const hand = [{ id: "A" }, { id: "B" }, { id: "C" }, { id: "D" }, { id: "E" }];
  const counter = (handIndex: number): Intent => ({ type: "counter_from_hand", handIndex });
  // B is not a counter card.
  const intents: Intent[] = [
    { type: "pass_counter" },
    counter(0),
    counter(2),
    counter(3),
    counter(4),
    { type: "counter_event", handIndex: 1 },
  ];

  /** Replays the sends against a hand that shrinks like the server's. */
  function replay(sent: Intent[]): (string | undefined)[] {
    const h = hand.map((c) => c.id);
    return sent.map((i) => h.splice(i.handIndex as number, 1)[0]);
  }

  it("sends the highest hand slot first so later slots stay valid", () => {
    const sent = resolveStagedCounters(intents, hand, ["A", "D", "C"]);
    expect(replay(sent).sort()).toEqual(["A", "C", "D"]);
  });

  it("does not depend on the order the cards were tapped in", () => {
    const one = resolveStagedCounters(intents, hand, ["A", "E"]);
    const two = resolveStagedCounters(intents, hand, ["E", "A"]);
    expect(two).toEqual(one);
  });

  it("looks cards up by id in the latest hand", () => {
    // D moved from slot 3 to slot 2 after C left the hand.
    const shifted = [{ id: "A" }, { id: "B" }, { id: "D" }, { id: "E" }];
    const sent = resolveStagedCounters([counter(0), counter(2), counter(3)], shifted, ["D"]);
    expect(sent).toEqual([counter(2)]);
  });

  it("drops cards that left the hand or have no legal counter", () => {
    expect(resolveStagedCounters(intents, hand, ["B", "gone"])).toEqual([]);
  });

  it("sends a card once even if it was staged twice", () => {
    expect(resolveStagedCounters(intents, hand, ["A", "A"])).toEqual([counter(0)]);
  });
});

describe("clockFraction", () => {
  const timer = (over: Partial<TimerMessage>): TimerMessage => ({
    protocolVersion: 5 as TimerMessage["protocolVersion"],
    turnSeconds: null,
    matchSeconds: null,
    turnEndsAt: null,
    matchEndsAt: null,
    activeSeat: 1,
    seatSeconds: null,
    seatRemainingMs: null,
    clockSeat: null,
    clockEndsAt: null,
    ...over,
  });

  it("drains your own chess clock while it runs for you", () => {
    const t = timer({ seatSeconds: 600, seatRemainingMs: [300_000, 600_000], clockSeat: 0, clockEndsAt: 300_000 });
    expect(clockFraction(t, 0, 0)).toBe(0.5);
  });

  it("ignores a chess clock that runs for the opponent", () => {
    const t = timer({ seatSeconds: 600, seatRemainingMs: [600_000, 300_000], clockSeat: 1, clockEndsAt: 300_000 });
    expect(clockFraction(t, 0, 0)).toBeNull();
  });

  it("falls back to the turn clock", () => {
    const t = timer({ turnSeconds: 100, turnEndsAt: 25_000 });
    expect(clockFraction(t, 0, 0)).toBe(0.25);
  });

  it("stays between empty and full", () => {
    const t = timer({ turnSeconds: 100, turnEndsAt: 5_000 });
    expect(clockFraction(t, 9_000, 0)).toBe(0);
    expect(clockFraction(t, -500_000, 0)).toBe(1);
  });

  it("has no bar without a timer", () => {
    expect(clockFraction(null, 0, 0)).toBeNull();
  });
});
