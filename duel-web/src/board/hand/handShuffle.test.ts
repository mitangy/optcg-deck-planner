import { describe, expect, it } from "vitest";
import { DROP_RIPPLE_MS, handShuffleSteps, type Pt } from "./handShuffle";

/** Cards 100px apart in one row, in `ids` order. */
function row(ids: readonly string[]): Map<string, Pt> {
  return new Map(ids.map((id, i) => [id, { x: 100 * i, y: 0 }]));
}

describe("handShuffleSteps", () => {
  it("lands a dropped card from the drop point and ripples the cards it pushed, nearest first (#338)", () => {
    // a b c d e → drag a onto the spot after c: b c a d e.
    const before = row(["a", "b", "c", "d", "e"]);
    before.set("a", { x: 260, y: -40 }); // the drop point
    const order = ["b", "c", "a", "d", "e"];
    const steps = handShuffleSteps("drop", before, row(order), order, { cardHeight: 140, landedId: "a" });
    const by = new Map(steps.map((s) => [s.id, s]));

    // d and e did not move: nothing to draw.
    expect([...by.keys()].sort()).toEqual(["a", "b", "c"]);
    expect(by.get("a")).toMatchObject({ dx: 60, dy: -40, landing: true, delay: 0 });
    // b and c slide back from their old spots, c (next to the landing) first.
    expect(by.get("b")).toMatchObject({ dx: 100, dy: 0, landing: false, delay: DROP_RIPPLE_MS });
    expect(by.get("c")).toMatchObject({ dx: 100, dy: 0, landing: false, delay: 0 });
  });

  it("lands a dropped card even when it ends up where it started (#338)", () => {
    const order = ["a", "b", "c"];
    const steps = handShuffleSteps("drop", row(order), row(order), order, { cardHeight: 140, landedId: "b" });
    expect(steps.map((s) => s.id)).toEqual(["b"]);
    expect(steps[0]!.landing).toBe(true);
  });

  it("riffles sorted cards along an arc, one after another in the new order (#338)", () => {
    // c a b → sorted a b c.
    const order = ["a", "b", "c"];
    const steps = handShuffleSteps("sort", row(["c", "a", "b"]), row(order), order, { cardHeight: 100 });
    expect(steps.map((s) => s.id)).toEqual(["a", "b", "c"]);
    const [a, b, c] = steps;
    // Arc up mid-flight.
    for (const s of steps) expect(s.lift).toBeLessThan(0);
    // Staggered by the new position.
    expect(a!.delay).toBe(0);
    expect(b!.delay).toBeGreaterThan(a!.delay);
    expect(c!.delay).toBeGreaterThan(b!.delay);
    // a and b travel left (came from the right), c travels right: they lean opposite ways.
    expect(a!.dx).toBeGreaterThan(0);
    expect(c!.dx).toBeLessThan(0);
    expect(Math.sign(a!.tilt)).toBe(Math.sign(b!.tilt));
    expect(Math.sign(a!.tilt)).toBe(-Math.sign(c!.tilt));
    expect(steps.every((s) => !s.landing)).toBe(true);
  });

  it("keeps a big hand's riffle short (#338)", () => {
    const ids = Array.from({ length: 20 }, (_, i) => `c${i}`);
    const order = [...ids].reverse();
    const steps = handShuffleSteps("sort", row(ids), row(order), order, { cardHeight: 100 });
    expect(Math.max(...steps.map((s) => s.delay))).toBeLessThanOrEqual(260);
  });
});
