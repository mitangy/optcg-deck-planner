import { describe, expect, it } from "vitest";
import { cx } from "./cx";

describe("cx", () => {
  it("keeps the strings and skips false, null, undefined and empty parts", () => {
    expect(cx("a", false, "b", null, undefined, "", "c")).toBe("a b c");
  });

  it("is empty when nothing is left", () => {
    expect(cx(false, null)).toBe("");
  });
});
