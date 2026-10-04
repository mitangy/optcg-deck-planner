import { describe, expect, it } from "vitest";
import type { Intent } from "../net/protocol";
import {
  attachLabel,
  attachTargetIds,
  beginAttach,
  donIdsForTarget,
  donQuickAttach,
  nextDonSelection,
  pruneDonSelection,
  quickAttachCounts,
  quickAttachLabel,
  resolveAttachIntents,
} from "./donSelection";

const intents: Intent[] = [
  { type: "give_don", donId: "d1", targetId: "leader" },
  { type: "give_don", donId: "d1", targetId: "c1" },
  { type: "give_don", donId: "d2", targetId: "leader" },
  { type: "give_don", donId: "d2", targetId: "c1" },
  { type: "give_don", donId: "d3", targetId: "leader" },
  { type: "end_turn" },
];
const legal = ["d1", "d2", "d3"];

describe("nextDonSelection", () => {
  it("adds an unselected chip", () => {
    expect([...nextDonSelection(new Set(), "d2", legal)]).toEqual(["d2"]);
  });

  it("repeated taps on a selected chip count up through the free DON!!", () => {
    let s = nextDonSelection(new Set(), "d1", legal);
    s = nextDonSelection(s, "d1", legal);
    expect(s.size).toBe(2);
    s = nextDonSelection(s, "d1", legal);
    expect(s.size).toBe(3);
  });

  it("wraps back to empty once every legal DON!! is selected", () => {
    const s = nextDonSelection(new Set(legal), "d3", legal);
    expect(s.size).toBe(0);
  });

  it("ignores taps on non-legal (rested) chips", () => {
    const prev = new Set(["d1"]);
    expect([...nextDonSelection(prev, "rested-9", legal)]).toEqual(["d1"]);
  });
});

describe("pruneDonSelection", () => {
  it("keeps the same reference when nothing changed", () => {
    const prev = new Set(["d1"]);
    expect(pruneDonSelection(prev, new Set(legal))).toBe(prev);
  });

  it("drops DON!! that are no longer legal", () => {
    expect([...pruneDonSelection(new Set(["d1", "d9"]), new Set(legal))]).toEqual(["d1"]);
  });
});

describe("attach flow", () => {
  it("only offers targets legal for every selected DON!!", () => {
    expect(attachTargetIds(intents, new Set(["d1", "d3"]))).toEqual(["leader"]);
    expect(attachTargetIds(intents, new Set(["d1", "d2"])).sort()).toEqual(["c1", "leader"]);
  });

  it("beginAttach returns a pending confirm only for legal targets", () => {
    expect(beginAttach(intents, new Set(["d1", "d3"]), "c1")).toBeNull();
    expect(beginAttach(intents, new Set(), "leader")).toBeNull();
    expect(beginAttach(intents, new Set(["d1", "d3"]), "leader")).toEqual({
      targetId: "leader",
      donIds: ["d1", "d3"],
    });
  });

  it("resolves one give_don per selected DON!! in order", () => {
    const sent = resolveAttachIntents(intents, { targetId: "c1", donIds: ["d2", "d1"] });
    expect(sent).toEqual([
      { type: "give_don", donId: "d2", targetId: "c1" },
      { type: "give_don", donId: "d1", targetId: "c1" },
    ]);
    expect(resolveAttachIntents(intents, null)).toEqual([]);
  });

  it("labels the confirm with the count", () => {
    expect(attachLabel(3)).toBe("Attach 3 DON!!");
  });
});

describe("donQuickAttach", () => {
  const give = (donId: string, targetId: string): Intent => ({ type: "give_don", donId, targetId });

  it("never gives more DON!! than the card can legally take", () => {
    expect(donQuickAttach(intents, "c1", 5)).toEqual([give("d1", "c1"), give("d2", "c1")]);
  });

  it("gives exactly the amount asked when enough are available", () => {
    expect(donQuickAttach(intents, "leader", 2)).toEqual([give("d1", "leader"), give("d2", "leader")]);
    expect(donQuickAttach(intents, "leader", 1)).toEqual([give("d1", "leader")]);
  });

  it("does not spend a slot on a DON!! that only fits another card", () => {
    // d0 can only go to A: asking B for 2 must still find two DON!! for B.
    const data = [give("d0", "A"), give("d1", "B"), give("d2", "B")];
    expect(donQuickAttach(data, "B", 2)).toEqual([give("d1", "B"), give("d2", "B")]);
  });

  it("uses each DON!! once even when it has several legal intents for the card", () => {
    const data = [give("d1", "A"), give("d1", "A"), give("d2", "A")];
    expect(donQuickAttach(data, "A", 2)).toEqual([give("d1", "A"), give("d2", "A")]);
  });

  it("All means every DON!! that is legal for the card", () => {
    const all = donIdsForTarget(intents, "leader");
    expect(donQuickAttach(intents, "leader", all.length)).toHaveLength(3);
  });
});

describe("quickAttachCounts", () => {
  it("offers nothing when no DON!! can be given", () => {
    expect(quickAttachCounts(0)).toEqual([]);
  });

  it("hides +2 when only one DON!! is available", () => {
    expect(quickAttachCounts(1)).toEqual([1]);
  });

  it("only adds All when it means more than +2", () => {
    expect(quickAttachCounts(2)).toEqual([1, 2]);
    expect(quickAttachCounts(5)).toEqual([1, 2, 5]);
  });
});

describe("quickAttachLabel", () => {
  it("spells out the DON!! given and the power it adds, with 'all' only on the All chip (#__P3__)", () => {
    const counts = quickAttachCounts(5);
    expect(quickAttachLabel(1, counts)).toBe("Give 1 DON!! (+1000)");
    expect(quickAttachLabel(2, counts)).toBe("Give 2 DON!! (+2000)");
    expect(quickAttachLabel(5, counts)).toBe("Give all 5 DON!! (+5000)");
    // With only two DON!! the +2 chip is the whole stack but is not labelled All.
    expect(quickAttachLabel(2, quickAttachCounts(2))).toBe("Give 2 DON!! (+2000)");
  });
});
