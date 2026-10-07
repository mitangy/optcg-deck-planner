import { describe, expect, it } from "vitest";
import { applyPlannerEdit, plannerDeckContext, showsLogPose } from "./logPose";

describe("Log Pose in the planner (#377)", () => {
  it("keeps the compass off public share pages and shows it on the signed-in pages (#377)", () => {
    expect(showsLogPose("/share/abc123")).toBe(false);
    for (const path of ["/", "/decks", "/decks/7", "/collection", "/group-buys", "/import"]) expect(showsLogPose(path), path).toBe(true);
  });

  it("sends a deck's main-deck cards with their copies, without the leader or DON!! (#377)", () => {
    const ctx = plannerDeckContext({
      id: 7,
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
      ref: "planner:7",
      plannerDeckId: 7,
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

  it("sends a variant deck's additional cards too (#400)", () => {
    const ctx = plannerDeckContext({
      id: 8,
      name: "Enel variant",
      leader_card_id: "OP05-098",
      cards: [
        { card_id: "OP05-100", needed: 4, section: "main" },
        { card_id: "OP05-103", needed: 3, section: "additional" },
        { card_id: "DON-001", needed: 10, section: "don" },
      ],
    });
    expect(ctx.cards).toEqual([
      { id: "OP05-100", copies: 4 },
      { id: "OP05-103", copies: 3 },
    ]);
  });
});

describe("applying a Log Pose edit to a planner deck (#400)", () => {
  const ops = [
    { id: "OP05-100", before: 2, after: 0 },
    { id: "OP05-101", before: 0, after: 3 },
    { id: "OP05-102", before: 4, after: 3 },
  ];

  /** A save that records its calls and fails for one (card, count). */
  function saver(failOn?: { id: string; needed: number }) {
    const calls: [string, number][] = [];
    const save = async (id: string, needed: number) => {
      calls.push([id, needed]);
      if (failOn && failOn.id === id && failOn.needed === needed) throw new Error("Network down");
      return calls.length;
    };
    return { calls, save };
  }

  it("saves the decreases first, one card at a time, and returns the last save's result (#400)", async () => {
    const { calls, save } = saver();
    const last = await applyPlannerEdit(save, ops);
    expect(calls).toEqual([
      ["OP05-100", 0],
      ["OP05-102", 3],
      ["OP05-101", 3],
    ]);
    expect(last).toBe(3);
  });

  it("puts saved lines back when a later save fails (#400)", async () => {
    const { calls, save } = saver({ id: "OP05-101", needed: 3 });
    await expect(applyPlannerEdit(save, ops)).rejects.toThrow("Couldn't save OP05-101: Network down. Nothing was changed.");
    // The two lines that went through are set back to their before counts.
    expect(calls.slice(3)).toEqual([
      ["OP05-102", 4],
      ["OP05-100", 2],
    ]);
  });

  it("says some changes were saved when putting them back fails too (#400)", async () => {
    const calls: [string, number][] = [];
    const save = async (id: string, needed: number) => {
      calls.push([id, needed]);
      if (calls.length >= 2) throw new Error("Network down");
    };
    await expect(applyPlannerEdit(save, ops)).rejects.toThrow(/Couldn't save OP05-102.*Some changes were saved; check the deck\./);
  });
});
