import { describe, expect, it } from "vitest";
import { fanDocked, fanPosForDrop, farFanPosForDrop, nudgeFanPos, parseFanPos, serializeFanPos } from "./handFanPos";

const VP = { width: 1000, height: 800 };
/** Default spot: centre of the board column. */
const DEFAULT_X = 500;

describe("parseFanPos", () => {
  it("reads a saved spot and keeps it inside the window (#261)", () => {
    expect(parseFanPos("0.3,0.5")).toEqual({ x: 0.3, y: 0.5 });
    expect(parseFanPos("1.5,-1")).toEqual({ x: 1, y: 0 });
    expect(parseFanPos(serializeFanPos({ x: 0.25, y: 1 }))).toEqual({ x: 0.25, y: 1 });
  });

  it("treats an empty or broken spot as the default (#261)", () => {
    expect(parseFanPos("")).toBeNull();
    expect(parseFanPos("left")).toBeNull();
    expect(parseFanPos("0.3")).toBeNull();
  });
});

describe("fanPosForDrop", () => {
  it("goes back to the default spot when dropped near it on the bottom edge (#261)", () => {
    expect(fanPosForDrop(530, 790, VP, DEFAULT_X)).toBeNull();
  });

  it("snaps onto the bottom edge away from the default spot, so it still tucks (#261)", () => {
    const pos = fanPosForDrop(900, 770, VP, DEFAULT_X)!;
    expect(pos).toEqual({ x: 0.9, y: 1 });
    expect(fanDocked(pos)).toBe(true);
  });

  it("floats where it is dropped higher up (#261)", () => {
    const pos = fanPosForDrop(530, 400, VP, DEFAULT_X)!;
    expect(pos).toEqual({ x: 0.53, y: 0.5 });
    expect(fanDocked(pos)).toBe(false);
  });
});

describe("nudgeFanPos", () => {
  it("moves by a step and lands on the bottom edge from just above it (#261)", () => {
    expect(nudgeFanPos({ x: 0.5, y: 0.5 }, "left")).toEqual({ x: 0.47, y: 0.5 });
    expect(nudgeFanPos({ x: 0.5, y: 0.5 }, "up")).toEqual({ x: 0.5, y: 0.47 });
    expect(nudgeFanPos({ x: 0.5, y: 0.96 }, "down").y).toBe(1);
    expect(nudgeFanPos({ x: 0.5, y: 1 }, "up").y).toBeCloseTo(0.97);
  });
});

describe("farFanPosForDrop", () => {
  // A 100px-tall far fan; the board's top edge is at y = 90 and its middle at x = 500.
  const drop = (centreX: number, bottom: number) => farFanPosForDrop(centreX, bottom, 100, VP, 90, DEFAULT_X);

  it("goes back to the strip along the top when dropped with its top edge and centre near it (#346)", () => {
    expect(drop(520, 200)).toBeNull();
  });

  it("stays where it was dropped anywhere else, and never snaps to the bottom edge (#346)", () => {
    // Centre far from the board's middle.
    expect(drop(900, 200)).toEqual({ x: 0.9, y: 0.25 });
    // Centred but lower down the board.
    expect(drop(500, 400)).toEqual({ x: 0.5, y: 0.5 });
    // Right above the bottom edge: still a floating spot, not docked.
    const low = drop(900, 790)!;
    expect(fanDocked(low)).toBe(false);
  });
});
