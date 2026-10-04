import { describe, expect, it } from "vitest";
import { clickCopy } from "./clickCopy";

describe("clickCopy", () => {
  it("says Click for a mouse and keeps Tap for touch (#282)", () => {
    expect(clickCopy("Tap again to end", true)).toBe("Click again to end");
    expect(clickCopy("Tap again to end", false)).toBe("Tap again to end");
  });

  it("changes every Tap in either case but not words that contain it (#282)", () => {
    expect(clickCopy("Tap to select (tap again to add more), then tap a Leader", true)).toBe(
      "Click to select (click again to add more), then click a Leader",
    );
    expect(clickCopy("Tapestry", true)).toBe("Tapestry");
  });
});
