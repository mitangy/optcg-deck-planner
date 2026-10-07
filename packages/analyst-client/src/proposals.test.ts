import { describe, expect, it } from "vitest";
import { applyOps, isEmptyAnswer, parseProposal, proposalState, undoOps, type DeckEditProposal, type DeckEditor } from "./proposals";

const wire = {
  id: "t1",
  version: 1,
  target: { ref: "duel:d1", name: "Luffy", leader_id: "ST01-001" },
  summary: "Tune the list",
  lines: [
    { id: "ST01-016", name: "Diable Jambe", before: 0, after: 2, reason: "Cheaper" },
    { id: "ST01-015", name: "Gum-Gum Jet Pistol", before: 2, after: 0, reason: "Too slow" },
  ],
  base: [
    { id: "ST01-015", copies: 2 },
    { id: "ST01-003", copies: 4 },
  ],
  legality: { legal: true, count: 50, problems: [], upcoming: [], ban_list_checked: true },
};

const proposal = (): DeckEditProposal => parseProposal(wire)!;
const editor = (cards: { id: string; copies: number }[], ref = "duel:d1"): DeckEditor => ({ ref, cards, apply: async () => {} });
const before = [
  { id: "ST01-015", copies: 2 },
  { id: "ST01-003", copies: 4 },
];

describe("deck edit proposals (#400)", () => {
  it("reads a proposal and drops malformed lines (#400)", () => {
    const p = parseProposal({
      ...wire,
      lines: [...wire.lines, { id: "ST01-017", name: "x", before: 1, after: 1, reason: "no change" }, { id: "ST01-018", name: "x", before: -1, after: 2 }, "junk", { name: "no id", before: 0, after: 1 }],
    })!;
    expect(p.lines.map((l) => l.id)).toEqual(["ST01-016", "ST01-015"]);
    expect(p.target).toEqual({ ref: "duel:d1", name: "Luffy", leaderId: "ST01-001" });
    expect(parseProposal({ ...wire, lines: [{ id: "ST01-017", name: "x", before: 1, after: 1 }] })).toBeNull();
    expect(parseProposal({ ...wire, target: { name: "no ref" } })).toBeNull();
  });

  it("is ready when every touched card is at its before count (#400)", () => {
    expect(proposalState(proposal(), editor(before))).toMatchObject({ kind: "ready", drifted: false });
    // Only the added card has moved: the removed one is still at before, but the card is no longer ready.
    expect(proposalState(proposal(), editor([...before, { id: "ST01-016", copies: 2 }])).kind).not.toBe("ready");
    expect(proposalState(proposal(), editor([{ id: "ST01-015", copies: 0 }, { id: "ST01-016", copies: 2 }])).kind).not.toBe("ready");
  });

  it("is applied when every touched card is at its after count, and undo swaps them (#400)", () => {
    const after = [{ id: "ST01-003", copies: 4 }, { id: "ST01-016", copies: 2 }];
    expect(proposalState(proposal(), editor(after)).kind).toBe("applied");
    expect(applyOps(proposal())).toEqual([
      { id: "ST01-016", before: 0, after: 2 },
      { id: "ST01-015", before: 2, after: 0 },
    ]);
    expect(undoOps(proposal())).toEqual([
      { id: "ST01-016", before: 2, after: 0 },
      { id: "ST01-015", before: 0, after: 2 },
    ]);
  });

  it("flags a conflict when a touched card changed, and drift when only others did (#400)", () => {
    const conflict = proposalState(proposal(), editor([{ id: "ST01-015", copies: 3 }, { id: "ST01-003", copies: 4 }]));
    expect(conflict).toEqual({ kind: "conflict", drifted: false, changed: [{ id: "ST01-015", now: 3 }] });
    const drift = proposalState(proposal(), editor([{ id: "ST01-015", copies: 2 }, { id: "ST01-003", copies: 3 }]));
    expect(drift).toMatchObject({ kind: "ready", drifted: true });
    // A card the model never saw also counts as drift.
    expect(proposalState(proposal(), editor([...before, { id: "ST01-009", copies: 1 }])).drifted).toBe(true);
  });

  it("is for another deck when the open deck's ref differs (#400)", () => {
    expect(proposalState(proposal(), editor(before, "duel:other")).kind).toBe("elsewhere");
    expect(proposalState(proposal(), null).kind).toBe("elsewhere");
  });

  it("counts a card saved with an art suffix as the same card (#400)", () => {
    expect(proposalState(proposal(), editor([{ id: "st01-015_p1", copies: 2 }, { id: "ST01-003", copies: 4 }])).kind).toBe("ready");
  });

  it("shows a dismissed edit as dismissed only while it could still be applied (#400)", () => {
    expect(proposalState(proposal(), editor(before), ["t1"]).kind).toBe("dismissed");
    expect(proposalState(proposal(), editor([{ id: "ST01-003", copies: 4 }, { id: "ST01-016", copies: 2 }]), ["t1"]).kind).toBe("applied");
  });

  it("keeps an answer that has only a deck edit (#400)", () => {
    expect(isEmptyAnswer({ text: "", proposals: [proposal()] })).toBe(false);
    expect(isEmptyAnswer({ text: "", proposals: [] })).toBe(true);
    expect(isEmptyAnswer({ text: "", stopped: true })).toBe(false);
    expect(isEmptyAnswer({ text: "Hi" })).toBe(false);
  });
});
