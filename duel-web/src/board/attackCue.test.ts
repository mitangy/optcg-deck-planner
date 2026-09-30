import { describe, expect, it } from "vitest";
import { DEMO_VIEW } from "../pages/DemoPage";
import type { PlayerView } from "../net/protocol";
import { attackCueDue, incomingAttackKey } from "./attackCue";

function withBattle(battle: unknown, over: Partial<PlayerView> = {}): PlayerView {
  return { ...DEMO_VIEW, turnNumber: 3, battle, ...over };
}

const against = (attackerId: string, target: unknown) => ({
  attackerSeat: 1,
  attackerId,
  target,
});

describe("incomingAttackKey", () => {
  it("has a key while the opponent attacks you", () => {
    expect(incomingAttackKey(withBattle(against("o-c1", { kind: "leader" })), false)).toEqual(
      expect.any(String),
    );
  });

  it("has no key for your own attack", () => {
    const mine = { attackerSeat: 0, attackerId: "y-leader", target: { kind: "leader" } };
    expect(incomingAttackKey(withBattle(mine), false)).toBeNull();
  });

  it("has no key for spectators, or without a battle", () => {
    expect(incomingAttackKey(withBattle(against("o-c1", { kind: "leader" })), true)).toBeNull();
    expect(incomingAttackKey(withBattle(null), false)).toBeNull();
    expect(incomingAttackKey(null, false)).toBeNull();
  });

  it("keeps the same key when a Blocker steps in on the attack", () => {
    const declared = against("o-c1", { kind: "character", instanceId: "y-c1" });
    const before = incomingAttackKey(withBattle(declared), false);
    const blocked = incomingAttackKey(withBattle({ ...declared, blockerId: "y-c3" }), false);
    expect(blocked).toBe(before);
  });

  it("changes for the next attacker and the next turn", () => {
    const leader = { kind: "leader" };
    const first = incomingAttackKey(withBattle(against("o-c1", leader)), false);
    expect(incomingAttackKey(withBattle(against("o-c2", leader)), false)).not.toBe(first);
    expect(incomingAttackKey(withBattle(against("o-c1", leader), { turnNumber: 5 }), false)).not.toBe(
      first,
    );
  });
});

describe("attackCueDue", () => {
  it("fires when an attack appears", () => {
    expect(attackCueDue(null, "3:o-c1:o-leader")).toBe(true);
  });

  it("does not fire again for the same attack on a re-render", () => {
    expect(attackCueDue("3:o-c1:o-leader", "3:o-c1:o-leader")).toBe(false);
  });

  it("fires for a different attack that follows directly", () => {
    expect(attackCueDue("3:o-c1:o-leader", "3:o-c2:o-leader")).toBe(true);
  });

  it("stays quiet when the attack ends", () => {
    expect(attackCueDue("3:o-c1:o-leader", null)).toBe(false);
  });
});
