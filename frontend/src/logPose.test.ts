import { describe, expect, it } from "vitest";
import { plannerDeckContext, showsLogPose } from "./logPose";

describe("Log Pose in the planner (#377)", () => {
  it("keeps the compass off public share pages and shows it on the signed-in pages (#377)", () => {
    expect(showsLogPose("/share/abc123")).toBe(false);
    for (const path of ["/", "/decks", "/decks/7", "/collection", "/group-buys", "/import"]) expect(showsLogPose(path), path).toBe(true);
  });

  it("sends a deck's main-deck cards with their copies, without the leader or DON!! (#377)", () => {
    const ctx = plannerDeckContext({
      name: "Purple Enel",
      leader_card_id: "OP05-098",
      cards: [
        { card_id: "OP05-098", needed: 1, section: "main" },
        { card_id: "OP05-100", needed: 4, section: "main" },
        { card_id: "OP05-101", needed: 2, section: "main" },
        { card_id: "DON-001", needed: 10, section: "don" },
        { card_id: "OP05-102", needed: 0, section: "main" },
      ],
    });
    expect(ctx).toEqual({
      name: "Purple Enel",
      leaderId: "OP05-098",
      cards: [
        { id: "OP05-100", copies: 4 },
        { id: "OP05-101", copies: 2 },
      ],
    });
  });

  it("tells Log Pose which planner deck is open (#399)", () => {
    const deck = { name: "Purple Enel", leader_card_id: "OP05-098", cards: [{ card_id: "OP05-100", needed: 4, section: "main" }] };
    expect(plannerDeckContext({ ...deck, id: 7 }).plannerDeckId).toBe(7);
    expect(plannerDeckContext(deck)).not.toHaveProperty("plannerDeckId");
  });
});
