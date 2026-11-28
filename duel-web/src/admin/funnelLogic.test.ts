import { describe, expect, it } from "vitest";
import { funnelRows, retentionRows } from "./funnelLogic";

describe("admin funnel numbers (#1499)", () => {
  it("each step's bar is scaled to the busiest step and no step claims to be a share of another (#1499)", () => {
    const rows = funnelRows([
      { step: "landing", visitors: 200, events: 260 },
      { step: "home_view", visitors: 50, events: 90 },
      { step: "game_start", visitors: 10, events: 12 },
    ]);
    expect(rows.map((r) => r.barPct)).toEqual([100, 25, 5]);
  });

  it("an all-zero funnel does not divide by zero (#1499)", () => {
    expect(funnelRows([{ step: "landing", visitors: 0, events: 0 }])[0]!.barPct).toBe(0);
  });

  it("a return rate counts only the accounts old enough to have had the chance (#1499)", () => {
    const [row] = retentionRows([{ week_start: "2026-11-16", size: 9, d1_eligible: 8, d1_returned: 2, d7_eligible: 0, d7_returned: 0 }]);
    expect(row).toMatchObject({ week: "Nov 16", size: 9, d1: "25.0%", d1Detail: "2 of 8", d7: "—" });
  });
});
