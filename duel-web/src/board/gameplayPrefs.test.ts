import { describe, expect, it } from "vitest";
import type { Intent } from "../net/protocol";
import { endTurnLeftovers, endTurnWarning, forcedDefensePass, responseStopPass } from "./gameplayPrefs";

const endOnly: Intent[] = [{ type: "end_turn" }];
const attack = (attackerId: string, kind = "leader"): Intent => ({
  type: "declare_attack",
  attackerId,
  target: { kind },
});
const give = (donId: string, targetId: string): Intent => ({ type: "give_don", donId, targetId });

describe("endTurnLeftovers", () => {
  it("counts each active DON!! once, however many targets it could go on", () => {
    const intents = [give("d1", "l"), give("d1", "c1"), give("d2", "l"), give("d2", "c1")];
    expect(endTurnLeftovers(intents)).toBe("2 DON!! unused");
  });

  it("counts each ready attacker once, however many targets it has", () => {
    expect(endTurnLeftovers([attack("l"), attack("l", "character"), attack("c1")])).toBe(
      "2 attackers ready",
    );
    expect(endTurnLeftovers([attack("l"), attack("l", "character")])).toBe("1 attacker ready");
  });

  it("names both when DON!! and attackers are left", () => {
    expect(endTurnLeftovers([give("d1", "l"), attack("l")])).toBe("1 DON!! + 1 atk");
    expect(endTurnLeftovers([give("d1", "l"), give("d2", "l"), attack("l"), attack("c1")])).toBe(
      "2 DON!! + 2 atk",
    );
  });

  it("stays quiet for actions that spend nothing useful", () => {
    const optionalOnly: Intent[] = [
      { type: "end_turn" },
      { type: "activate_ability", sourceId: "s", abilityId: "a" },
      { type: "activate_leader", sourceId: "l" },
      { type: "play_card", handIndex: 0 },
    ];
    expect(endTurnLeftovers(optionalOnly)).toBeNull();
    expect(endTurnLeftovers(endOnly)).toBeNull();
  });
});

describe("endTurnWarning", () => {
  it("asks in 'actions' mode only for unspent DON!! or a ready attacker, with the reason", () => {
    expect(endTurnWarning("actions", [give("d1", "l")])).toEqual({ reason: "1 DON!! unused" });
    expect(endTurnWarning("actions", [attack("c1")])).toEqual({ reason: "1 attacker ready" });
    expect(endTurnWarning("actions", [{ type: "play_card", handIndex: 0 }])).toBeNull();
    expect(endTurnWarning("actions", endOnly)).toBeNull();
  });

  it("always asks in 'always' mode, without a reason, and never in 'never' mode", () => {
    expect(endTurnWarning("always", endOnly)).toEqual({ reason: null });
    // Something is left here, yet "always" still carries no reason.
    expect(endTurnWarning("always", [give("d1", "l")])).toEqual({ reason: null });
    expect(endTurnWarning("never", [attack("c1")])).toBeNull();
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
    expect(forcedDefensePass([attack("c1"), ...endOnly])).toBeNull();
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
