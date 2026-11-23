import { describe, expect, it } from "vitest";
import type { GroupBuyMember } from "../../api";
import { canConfirmReceived, handoffChip, handoffCounts, handoffMembers, myHandoffText } from "./handoff";

const member = (over: Partial<GroupBuyMember>): GroupBuyMember => ({
  user_id: 2,
  display_name: "Friend",
  role: "member",
  deck_ids: null,
  cards_still_needed: 0,
  remaining_market: 0,
  ...over,
});

describe("Hand-off status text (#1418)", () => {
  it("the host row counts cards ready and handed over, singular for one (#1418)", () => {
    expect(handoffCounts({ ready_to_hand_over: 3, qty_handed: 2 })).toBe("3 cards ready · 2 handed over");
    expect(handoffCounts({ ready_to_hand_over: 1, qty_handed: 0 })).toBe("1 card ready · 0 handed over");
  });

  it("each hand-off state is a different word, so the chip never relies on colour (#1418)", () => {
    const labels = ["waiting", "shipped", "handed_over", "received"].map((s) => handoffChip(s).label);
    expect(labels).toEqual(["Waiting", "Shipped", "Handed over", "Received"]);
  });

  it("a member reads Ready for pickup while cards are waiting, then Shipped or Handed over (#1418)", () => {
    expect(myHandoffText(member({ handoff_status: "waiting", ready_to_hand_over: 4 }))).toBe("Ready for pickup: 4 cards");
    expect(myHandoffText(member({ handoff_status: "waiting", ready_to_hand_over: 0 }))).toBeNull();
    expect(myHandoffText(member({ handoff_status: "shipped", ready_to_hand_over: 0 }))).toBe("Shipped");
    expect(myHandoffText(member({ handoff_status: "handed_over", ready_to_hand_over: 0 }))).toBe("Handed over");
  });

  it("new arrivals after Received show as ready for pickup again (#1418)", () => {
    expect(myHandoffText(member({ handoff_status: "received", ready_to_hand_over: 1 }))).toBe("Ready for pickup: 1 card");
    expect(myHandoffText(member({ handoff_status: "received", ready_to_hand_over: 0 }))).toBe("Received");
  });

  it("I got my cards shows only for shipped or handed over (#1418)", () => {
    expect(["waiting", "shipped", "handed_over", "received", undefined].map(canConfirmReceived)).toEqual([
      false,
      true,
      true,
      false,
      false,
    ]);
  });

  it("the hand-off list leaves out the host, who already holds their cards (#1418)", () => {
    const list = handoffMembers([member({ user_id: 1, role: "host" }), member({ user_id: 2 })]);
    expect(list.map((m) => m.user_id)).toEqual([2]);
  });
});
