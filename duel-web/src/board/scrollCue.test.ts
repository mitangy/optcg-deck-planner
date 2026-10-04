import { describe, expect, it } from "vitest";
import { moreBelow } from "./scrollCue";

describe("moreBelow", () => {
  it("flags a card text that runs past the bottom of the preview (#__P2__)", () => {
    expect(moreBelow({ scrollTop: 0, clientHeight: 120, scrollHeight: 300 })).toBe(true);
  });

  it("clears once the text is scrolled to its end (#__P2__)", () => {
    expect(moreBelow({ scrollTop: 180, clientHeight: 120, scrollHeight: 300 })).toBe(false);
  });

  it("does not flag text that fits, even with a pixel of rounding (#__P2__)", () => {
    expect(moreBelow({ scrollTop: 0, clientHeight: 120, scrollHeight: 121 })).toBe(false);
    expect(moreBelow({ scrollTop: 0, clientHeight: 120, scrollHeight: 120 })).toBe(false);
  });
});
