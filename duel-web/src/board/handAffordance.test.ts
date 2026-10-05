import { describe, expect, it } from "vitest";
import { donShortfall, handCardOutOfReach, needsDonHint } from "./handAffordance";

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

describe("Gray out unplayable cards setting (#301)", () => {
  const outOfReach = { mainPhase: true, picking: false, playable: false, cost: 5, activeDon: 2 };

  it("grays out a cost-5 card with 2 active DON!! while the setting is on (#301)", () => {
    expect(handCardOutOfReach({ ...outOfReach, dimSetting: true })).toBe(true);
  });

  it("keeps the same card at full colour with the setting off (#301)", () => {
    expect(handCardOutOfReach({ ...outOfReach, dimSetting: false })).toBe(false);
  });
});
