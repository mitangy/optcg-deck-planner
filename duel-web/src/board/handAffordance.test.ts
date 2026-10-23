import { describe, expect, it } from "vitest";
import { blockedReason, blockedTitle, donShortfall, handCardOutOfReach, handCostCaption, needsDonHint } from "./handAffordance";

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

describe("hand cards an effect stops you playing (#671)", () => {
  const base = { mainPhase: true, picking: false, playable: false, cost: 3, activeDon: 10, dimSetting: true };

  it("a blocked card is grayed out even with plenty of DON!! (#671)", () => {
    expect(handCardOutOfReach({ ...base, blocked: "characters" })).toBe(true);
    expect(handCardOutOfReach(base)).toBe(false);
  });

  it("a blocked card stays at full colour with the setting off (#671)", () => {
    expect(handCardOutOfReach({ ...base, blocked: "characters", dimSetting: false })).toBe(false);
  });

  it("the caption says Can't play only for a blocked card, with the cost in its tooltip (#671)", () => {
    expect(handCostCaption(3, "characters")).toBe("Can't play");
    expect(blockedTitle(3, "characters")).toBe("Cost 3. An effect stops you playing Character cards this turn.");
    expect(handCostCaption(3)).toBe("Cost 3");
  });

  it("each block names its own reason, and the selected-card hint prefers it over a DON!! shortfall (#671)", () => {
    expect(blockedReason("characters")).toContain("Character");
    expect(blockedReason("events")).toContain("Event");
    expect(blockedReason("from_hand")).toContain("from your hand");
    expect(needsDonHint(5, 1, "events")).toBe(blockedReason("events"));
    expect(needsDonHint(5, 1)).toBe("Needs 5 DON!! (you have 1)");
  });
});
