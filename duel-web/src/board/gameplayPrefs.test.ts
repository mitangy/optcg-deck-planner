import { describe, expect, it } from "vitest";
import type { Intent } from "../net/protocol";
import { endTurnNeedsConfirm, forcedDefensePass, responseStopPass } from "./gameplayPrefs";

const endOnly: Intent[] = [{ type: "end_turn" }];
const canAttack: Intent[] = [
  { type: "declare_attack", attackerId: "c1", target: { kind: "leader" } },
  { type: "end_turn" },
];

describe("endTurnNeedsConfirm", () => {
  it("asks in 'actions' mode only while another turn action is legal", () => {
    expect(endTurnNeedsConfirm("actions", canAttack)).toBe(true);
    expect(endTurnNeedsConfirm("actions", endOnly)).toBe(false);
  });

  it("always asks in 'always' mode and never in 'never' mode", () => {
    expect(endTurnNeedsConfirm("always", endOnly)).toBe(true);
    expect(endTurnNeedsConfirm("never", canAttack)).toBe(false);
  });
});

describe("forcedDefensePass", () => {
  it("passes block when there is no blocker", () => {
    expect(forcedDefensePass([{ type: "pass_block" }])).toEqual({ type: "pass_block" });
  });

  it("does not pass block when a blocker is available", () => {
    expect(
      forcedDefensePass([{ type: "pass_block" }, { type: "declare_block", blockerId: "c2" }]),
    ).toBeNull();
  });

  it("passes counter only when no counter card or event is usable", () => {
    expect(forcedDefensePass([{ type: "pass_counter" }])).toEqual({ type: "pass_counter" });
    expect(
      forcedDefensePass([{ type: "pass_counter" }, { type: "counter_from_hand", handIndex: 0 }]),
    ).toBeNull();
    expect(
      forcedDefensePass([{ type: "pass_counter" }, { type: "counter_event", handIndex: 1 }]),
    ).toBeNull();
  });

  it("never acts outside a block or counter step", () => {
    expect(forcedDefensePass(canAttack)).toBeNull();
  });
});

describe("responseStopPass", () => {
  const passCounter: Intent = { type: "pass_counter" };
  const counters: Intent[] = [
    passCounter,
    { type: "counter_from_hand", handIndex: 0 },
    { type: "counter_from_hand", handIndex: 1 },
  ];
  const outlook = (gap: number | null, ...values: (number | null)[]) => ({ gap, values });

  it("never passes in 'always' mode, even when passing is the only option", () => {
    expect(responseStopPass("always", [{ type: "pass_block" }])).toBeNull();
    expect(responseStopPass("always", [passCounter])).toBeNull();
  });

  it("passes in 'auto' mode only when it is the only option", () => {
    expect(responseStopPass("auto", [{ type: "pass_block" }])).toEqual({ type: "pass_block" });
    expect(responseStopPass("auto", [passCounter])).toEqual(passCounter);
    // Counters that cannot save still stop you in auto.
    expect(responseStopPass("auto", counters, outlook(5000, 1000, 1000))).toBeNull();
  });

  it("passes in 'smart' mode when every Counter card together falls short", () => {
    expect(responseStopPass("smart", counters, outlook(5000, 1000, 2000))).toEqual(passCounter);
  });

  it("stops in 'smart' mode when the Counter cards exactly reach the gap", () => {
    expect(responseStopPass("smart", counters, outlook(3000, 1000, 2000))).toBeNull();
    expect(responseStopPass("smart", counters, outlook(2000, 1000, 2000))).toBeNull();
  });

  it("stops in 'smart' mode whenever a [Counter] event is legal", () => {
    const withEvent = [...counters, { type: "counter_event", handIndex: 2 }];
    expect(responseStopPass("smart", withEvent, outlook(9000, 1000, 1000))).toBeNull();
  });

  it("stops in 'smart' mode when a Counter value or the gap is unknown", () => {
    expect(responseStopPass("smart", counters, outlook(9000, 1000, null))).toBeNull();
    expect(responseStopPass("smart", counters, outlook(null, 1000, 1000))).toBeNull();
    expect(responseStopPass("smart", counters)).toBeNull();
  });

  it("acts like auto in the block step", () => {
    const block: Intent[] = [{ type: "pass_block" }, { type: "declare_block", blockerId: "c1" }];
    expect(responseStopPass("smart", block, outlook(9000))).toBeNull();
    expect(responseStopPass("smart", [{ type: "pass_block" }])).toEqual({ type: "pass_block" });
  });
});
