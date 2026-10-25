import { describe, expect, it } from "vitest";
import {
  applyOps,
  AUTO_APPLIED_KEY,
  isEmptyAnswer,
  markAutoApplied,
  parseProposal,
  proposalState,
  readAutoApplied,
  shouldAutoApply,
  undoOps,
  type DeckEditProposal,
  type DeckEditor,
  type ProposalState,
} from "./proposals";

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

  it("keeps an answer that has only a new deck (#726)", () => {
    expect(isEmptyAnswer({ text: "", drafts: [{ id: "d1" }] })).toBe(false);
    expect(isEmptyAnswer({ text: "", drafts: [] })).toBe(true);
  });

  it("keeps an answer that has only a turn plan (#416)", () => {
    expect(isEmptyAnswer({ text: "", plans: [{ id: "p1" }] })).toBe(false);
    expect(isEmptyAnswer({ text: "", plans: [] })).toBe(true);
  });
});

describe("auto-applying the edits Log Pose was asked to make (#726)", () => {
  const asked = (): DeckEditProposal => parseProposal({ ...wire, apply: true })!;
  const ready: ProposalState = { kind: "ready", drifted: false, changed: [] };
  const stateOf = (kind: ProposalState["kind"]): ProposalState => ({ ...ready, kind });

  it("reads apply only when the wire says true (#726)", () => {
    expect(asked().apply).toBe(true);
    expect(proposal().apply).toBe(false);
    expect(parseProposal({ ...wire, apply: "true" })!.apply).toBe(false);
  });

  it("applies a live edit that was asked for, once the deck is open and untouched (#726)", () => {
    expect(shouldAutoApply(asked(), ready, [], true)).toBe(true);
  });

  it("does not apply a plain suggestion (#726)", () => {
    expect(shouldAutoApply(proposal(), ready, [], true)).toBe(false);
  });

  it("does not apply an edit reloaded from the saved thread (#726)", () => {
    expect(shouldAutoApply(asked(), ready, [], false)).toBe(false);
  });

  it("does not apply when the deck is not ready for it (#726)", () => {
    for (const kind of ["applied", "conflict", "elsewhere", "dismissed"] as const) expect(shouldAutoApply(asked(), stateOf(kind), [], true)).toBe(false);
  });

  it("never applies the same edit twice, whether the handled ids come as a list or a set (#726)", () => {
    expect(shouldAutoApply(asked(), ready, ["t1"], true)).toBe(false);
    expect(shouldAutoApply(asked(), ready, new Set(["t1"]), true)).toBe(false);
    expect(shouldAutoApply(asked(), ready, ["other"], true)).toBe(true);
  });

  it("remembers handled edits on this device, newest 200, and survives blocked storage (#726)", () => {
    const data = new Map<string, string>();
    const storage = { getItem: (k: string) => data.get(k) ?? null, setItem: (k: string, v: string) => void data.set(k, v) };
    expect(readAutoApplied(storage)).toEqual([]);
    markAutoApplied("t1", storage);
    markAutoApplied("t1", storage);
    expect(readAutoApplied(storage)).toEqual(["t1"]);
    expect(JSON.parse(data.get(AUTO_APPLIED_KEY)!)).toEqual(["t1"]);
    for (let i = 0; i < 205; i++) markAutoApplied(`e${i}`, storage);
    const kept = readAutoApplied(storage);
    expect(kept).toHaveLength(200);
    expect(kept.at(-1)).toBe("e204");
    expect(kept).not.toContain("t1");
    // What is stored is capped too, and an oversized list left by an older version is still read as the newest 200.
    expect(JSON.parse(data.get(AUTO_APPLIED_KEY)!)).toHaveLength(200);
    data.set(AUTO_APPLIED_KEY, JSON.stringify(Array.from({ length: 250 }, (_, i) => `o${i}`)));
    expect(readAutoApplied(storage)).toHaveLength(200);
    expect(readAutoApplied(storage)[0]).toBe("o50");
    const blocked = { getItem: () => { throw new Error("blocked"); }, setItem: () => { throw new Error("blocked"); } };
    expect(readAutoApplied(blocked)).toEqual([]);
    expect(() => markAutoApplied("x", blocked)).not.toThrow();
  });
});
