import { describe, expect, it } from "vitest";
import { DEMO_VIEW } from "../pages/DemoPage";

describe("demo playmat fixture", () => {
  it("has Sim-like zone counts for both sides", () => {
    expect(DEMO_VIEW.you.lifeCount).toBeGreaterThan(0);
    expect(DEMO_VIEW.you.donDeckCount).toBeGreaterThan(0);
    expect(DEMO_VIEW.you.costArea.length).toBeGreaterThan(0);
    expect(DEMO_VIEW.you.hand.length).toBeGreaterThan(0);
    expect(DEMO_VIEW.opponent.handCount).toBeGreaterThan(0);
    expect(DEMO_VIEW.opponent.costAreaCount).toBeGreaterThan(0);
  });
});
