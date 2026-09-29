import { describe, expect, it } from "vitest";
import type { Intent } from "../net/protocol";
import {
  attachLabel,
  attachTargetIds,
  beginAttach,
  nextDonSelection,
  pruneDonSelection,
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
