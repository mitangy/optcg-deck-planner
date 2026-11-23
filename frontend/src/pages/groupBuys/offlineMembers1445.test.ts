import { describe, expect, it } from "vitest";
import type { GroupBuyLine, GroupBuyMember } from "../../api";
import { buyingForQty, canManageOffline, offlineMembers, pasteSummary, resolveBuyingFor } from "./offlineMembersModel";

const member = (user_id: number, is_offline = false, role = "member"): GroupBuyMember => ({
  user_id,
  display_name: `M${user_id}`,
  role,
  deck_ids: null,
  cards_still_needed: 0,
  remaining_market: 0,
  is_offline,
});

describe("group buy members who are not on the app (#1445)", () => {
  it("offlineMembers keeps only the typed-in names (#1445)", () => {
    const list = [member(1, false, "host"), member(2, true), member(3)];
    expect(offlineMembers(list).map((m) => m.user_id)).toEqual([2]);
  });

  it("only the host of an open group buy manages offline members (#1445)", () => {
    expect(canManageOffline({ is_host: true, status: "open" })).toBe(true);
    expect(canManageOffline({ is_host: false, status: "open" })).toBe(false);
    expect(canManageOffline({ is_host: true, status: "locked" })).toBe(false);
  });

  it("Buying for resolves only to an offline member that still exists (#1445)", () => {
    const list = [member(1, false, "host"), member(2, true), member(3)];
    expect(resolveBuyingFor(list, 2)?.user_id).toBe(2);
    expect(resolveBuyingFor(list, 3)).toBeNull();
    expect(resolveBuyingFor(list, 99)).toBeNull();
    expect(resolveBuyingFor(list, null)).toBeNull();
  });

  it("Buying for reads that member's own copies off the line, not the host's (#1445)", () => {
    const line = {
      members: [
        { user_id: 1, display_name: "Host", qty: 2 },
        { user_id: 2, display_name: "Sam", qty: 5 },
      ],
    } as Pick<GroupBuyLine, "members">;
    expect(buyingForQty(line, 2)).toBe(5);
    expect(buyingForQty(line, 1)).toBe(2);
    expect(buyingForQty(line, 7)).toBe(0);
  });

  it("the paste summary counts set cards and unreadable lines (#1445)", () => {
    expect(pasteSummary({ applied: 1, unmatched: [] }, "Sam")).toBe("1 card set for Sam.");
    expect(pasteSummary({ applied: 3, unmatched: ["x"] }, "Sam")).toBe("3 cards set for Sam. 1 line was not recognised.");
    expect(pasteSummary({ applied: 0, unmatched: ["x", "y"] }, "Sam")).toBe("0 cards set for Sam. 2 lines were not recognised.");
  });
});
