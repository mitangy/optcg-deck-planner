import { describe, expect, it } from "vitest";
import { peekPillLeft } from "./peekPill";

describe("peekPillLeft", () => {
  const gap = { from: 480, to: 890 };

  it("centres the pill on the board column when the bar leaves room (#__P3__)", () => {
    expect(peekPillLeft(gap, 260, 690)).toBe(560);
  });

  it("slides right of the status chips when they run past the centre, and left of the buttons (#__P3__)", () => {
    expect(peekPillLeft({ from: 620, to: 1000 }, 260, 690)).toBe(620);
    expect(peekPillLeft({ from: 400, to: 700 }, 260, 690)).toBe(440);
  });

  it("gives up when the gap is narrower than the pill (#__P3__)", () => {
    expect(peekPillLeft({ from: 600, to: 800 }, 260, 690)).toBeNull();
  });
});
