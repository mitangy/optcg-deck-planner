import { describe, expect, it } from "vitest";
import { donShortfall, needsDonHint } from "./handAffordance";

describe("hand affordability (#276)", () => {
  it("a cost-3 card with 1 active DON!! is 2 short and says so (#276)", () => {
    expect(donShortfall(3, 1)).toBe(2);
    expect(needsDonHint(3, 1)).toBe("Needs 3 DON!! (you have 1)");
  });

  it("a card that costs exactly the active DON!! is affordable (#276)", () => {
    expect(donShortfall(3, 3)).toBe(0);
    expect(needsDonHint(3, 3)).toBeNull();
  });
});
