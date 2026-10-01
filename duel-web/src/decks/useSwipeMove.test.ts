import { describe, expect, it } from "vitest";
import { swipeAxis, swipeCommits } from "./useSwipeMove";

describe("swipeAxis", () => {
  it("leaves a mostly vertical move to page scrolling", () => {
    expect(swipeAxis(8, 30)).toBe("y");
    expect(swipeAxis(30, 8)).toBe("x");
    expect(swipeAxis(-30, 8)).toBe("x");
  });

  it("waits for the finger to move past the slop before deciding", () => {
    expect(swipeAxis(6, 4)).toBe(null);
  });
});

describe("swipeCommits", () => {
  it("moves a deck only once the swipe covers ~40% of the row, either way", () => {
    // 343px row (375px phone): needs 137px.
    expect(swipeCommits(120, 343)).toBe(false);
    expect(swipeCommits(140, 343)).toBe(true);
    expect(swipeCommits(-140, 343)).toBe(true);
    expect(swipeCommits(-120, 343)).toBe(false);
  });

  it("never needs more than 140px on wide rows", () => {
    expect(swipeCommits(141, 800)).toBe(true);
  });
});

describe("swipe flicks", () => {
  it("moves a deck on a quick flick short of the swipe distance", () => {
    expect(swipeCommits(60, 343, 0.9)).toBe(true);
    expect(swipeCommits(60, 343, 0.2)).toBe(false);
  });

  it("ignores a flick back the other way", () => {
    expect(swipeCommits(60, 343, -0.9)).toBe(false);
  });
});
