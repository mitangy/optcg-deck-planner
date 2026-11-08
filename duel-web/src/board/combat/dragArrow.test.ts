import { describe, expect, it } from "vitest";
import type { Box } from "./battleArc";
import { boxCenter } from "./battleArc";
import { dragArrow } from "./dragArrow";

const ATTACKER: Box = { left: 500, top: 500, width: 80, height: 112 };
const OPP_LEADER: Box = { left: 500, top: 100, width: 80, height: 112 };
const boxes: Record<string, Box> = { "o-leader": OPP_LEADER };
const find = (id: string) => boxes[id] ?? null;

describe("attack drag arrow", () => {
  it("is drawn to the pointer as soon as the drag leaves the attacker (#270)", () => {
    const aim = dragArrow(ATTACKER, { x: 300, y: 320 }, null, find);
    expect(aim?.targetId).toBeNull();
    expect(aim?.arc.to.x).toBeCloseTo(300);
    expect(aim?.arc.to.y).toBeCloseTo(320);
  });

  it("snaps onto a legal target under the pointer (#270)", () => {
    const aim = dragArrow(ATTACKER, { x: 510, y: 110 }, { kind: "attack_target", targetId: "o-leader" }, find);
    expect(aim?.targetId).toBe("o-leader");
    expect(aim?.targetBox).toEqual(OPP_LEADER);
    // Ends near the leader's centre (the reticle), not at the pointer in its corner.
    const c = boxCenter(OPP_LEADER);
    expect(Math.hypot(aim!.arc.to.x - c.x, aim!.arc.to.y - c.y)).toBeLessThan(20);
  });

  it("draws nothing while the pointer is still on the attacker (#270)", () => {
    expect(dragArrow(ATTACKER, { x: 540, y: 560 }, null, find)).toBeNull();
  });
});
