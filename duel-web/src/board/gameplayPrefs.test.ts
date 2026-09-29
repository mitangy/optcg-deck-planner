import { describe, expect, it } from "vitest";
import type { Intent } from "../net/protocol";
import { endTurnNeedsConfirm, forcedDefensePass } from "./gameplayPrefs";

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
