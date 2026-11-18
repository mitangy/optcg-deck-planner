import { describe, expect, it } from "vitest";
import type { Trade } from "./friendsApi";
import { AVATAR_TONES, avatarTone } from "./avatarTone";
import { navBadgeCount, tradesTabCount } from "./tradeLogic";

const summary = (over: Partial<Parameters<typeof navBadgeCount>[0] & object> = {}) => ({
  incoming_pending: 0,
  active: 0,
  friend_requests: 0,
  to_apply: 0,
  ...over,
});

describe("Friends nav badge counts only what needs the user (#1362)", () => {
  it("counts incoming friend requests (#1362)", () => {
    expect(navBadgeCount(summary({ friend_requests: 2 }))).toBe(2);
  });

  it("counts completed trades still to apply (#1362)", () => {
    expect(navBadgeCount(summary({ to_apply: 3 }))).toBe(3);
  });

  it("does not count agreed trades waiting on a physical swap (#1362)", () => {
    expect(navBadgeCount(summary({ active: 4 }))).toBe(0);
  });
});

const trade = (over: Partial<Trade>): Trade =>
  ({ id: 1, status: "pending", my_applied: false, lines: [], ...over }) as unknown as Trade;

describe("Trades tab count (#1362)", () => {
  it("counts offers to answer and completed trades not yet applied, not accepted or applied ones (#1362)", () => {
    const count = tradesTabCount({
      incoming: [trade({ id: 1 }), trade({ id: 2 })],
      active: [
        trade({ id: 3, status: "accepted" }),
        trade({ id: 4, status: "completed", my_applied: false }),
        trade({ id: 5, status: "completed", my_applied: true }),
      ],
    });
    expect(count).toBe(3);
  });
});

describe("Friend avatar colours (#1362)", () => {
  it("stays inside the palette and spreads different names across several tones (#1362)", () => {
    const names = ["luffy", "zoro", "nami", "sanji", "usopp", "robin", "chopper", "franky", "brook", "jinbe"];
    const tones = names.map(avatarTone);
    for (const t of tones) {
      expect(t).toBeGreaterThanOrEqual(0);
      expect(t).toBeLessThan(AVATAR_TONES);
    }
    expect(new Set(tones).size).toBeGreaterThanOrEqual(4);
  });
});
