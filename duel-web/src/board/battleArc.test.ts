import { describe, expect, it } from "vitest";
import { DEMO_VIEW } from "../pages/DemoPage";
import type { PlayerView } from "../net/protocol";
import { arcGeometry, battleEndpoints, sameBox } from "./battleArc";

function withBattle(battle: unknown): PlayerView {
  return { ...DEMO_VIEW, battle };
}

describe("battleEndpoints", () => {
  it("is null without a battle", () => {
    expect(battleEndpoints(null)).toBeNull();
    expect(battleEndpoints(withBattle(null))).toBeNull();
  });

  it("resolves a leader attack to the defending seat's leader", () => {
    const e = battleEndpoints(
      withBattle({ attackerSeat: 0, attackerId: "y-leader", target: { kind: "leader" } }),
    );
    expect(e).toEqual({
      attackerId: "y-leader",
      targetId: "o-leader",
      redirectedFromId: null,
      incoming: false,
    });
  });

  it("flags incoming attacks on your side", () => {
    const e = battleEndpoints(
      withBattle({
        attackerSeat: 1,
        attackerId: "o-c1",
        target: { kind: "character", instanceId: "y-c3" },
      }),
    );
    expect(e?.targetId).toBe("y-c3");
    expect(e?.incoming).toBe(true);
  });

  it("points at the blocker and remembers the original target", () => {
    const e = battleEndpoints(
      withBattle({
        attackerSeat: 1,
        attackerId: "o-c1",
        target: { kind: "character", instanceId: "y-c1" },
        blockerId: "y-c1",
        originalTargetId: "y-leader",
      }),
    );
    expect(e?.targetId).toBe("y-c1");
    expect(e?.redirectedFromId).toBe("y-leader");
  });

  it("is null when ids are not on the board", () => {
    expect(
      battleEndpoints(withBattle({ attackerId: "ghost", target: { kind: "leader" } })),
    ).toBeNull();
  });
});

describe("arcGeometry", () => {
  const a = { left: 100, top: 400, width: 60, height: 84 };
  const b = { left: 300, top: 100, width: 60, height: 84 };

  it("starts near the attacker and ends near the target centre", () => {
    const g = arcGeometry(a, b);
    expect(Math.hypot(g.from.x - 130, g.from.y - 442)).toBeLessThan(30);
    expect(Math.hypot(g.to.x - 330, g.to.y - 142)).toBeLessThan(20);
    expect(g.d.startsWith("M ")).toBe(true);
    expect(g.d).toContain(" Q ");
    expect(g.length).toBeGreaterThan(Math.hypot(g.to.x - g.from.x, g.to.y - g.from.y) - 1);
  });

  it("bows the control point off the straight line", () => {
    const g = arcGeometry(a, b);
    const mid = { x: (g.from.x + g.to.x) / 2, y: (g.from.y + g.to.y) / 2 };
    expect(Math.hypot(g.control.x - mid.x, g.control.y - mid.y)).toBeGreaterThan(20);
  });
});

describe("sameBox", () => {
  it("tolerates sub-pixel jitter", () => {
    expect(sameBox({ left: 1, top: 1, width: 5, height: 5 }, { left: 1.2, top: 1, width: 5, height: 5 })).toBe(true);
    expect(sameBox({ left: 1, top: 1, width: 5, height: 5 }, { left: 3, top: 1, width: 5, height: 5 })).toBe(false);
    expect(sameBox(null, null)).toBe(true);
  });
});
