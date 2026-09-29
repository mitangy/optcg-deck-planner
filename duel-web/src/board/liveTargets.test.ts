import { describe, expect, it } from "vitest";
import { DEMO_VIEW } from "../pages/DemoPage";
import { indexLiveCards, readinessLabel } from "./liveTargets";

describe("liveTargets", () => {
  it("indexes both sides with seats and character slots", () => {
    const map = indexLiveCards(DEMO_VIEW);
    expect(map.get("y-leader")).toMatchObject({ seat: 0, zone: "leader" });
    expect(map.get("y-c2")).toMatchObject({ seat: 0, zone: "character", slot: 2 });
    expect(map.get("o-leader")).toMatchObject({ seat: 1, zone: "leader" });
  });

  it("tells identical-looking targets apart by readiness", () => {
    const base = { id: "c", defId: "ST01-003", seat: 0 as const, zone: "character" as const };
    expect(readinessLabel({ ...base, summoningSick: true })).toBe("Summoning sick");
    expect(readinessLabel({ ...base })).toBe("Can attack");
    expect(readinessLabel({ ...base, rested: true, summoningSick: true })).toBe("Rested");
    expect(readinessLabel({ ...base, zone: "leader" })).toBe("Active");
  });
});
