import { describe, expect, it } from "vitest";
import { loadCatalog } from "../../src/catalog";
import { buildCases } from "./cases";
import { applyAdvice, editLines, extractAdviceEdits, scoreRemoval } from "./edits";
import { fixtureDecks } from "./fixture";

const catalog = loadCatalog();
const sab = buildCases(catalog, fixtureDecks(), { mode: "sabotaged", seed: 1 })[0]!;
const proposal = (lines: { id: string; before: number; after: number }[]) => ({ lines: lines.map((l) => ({ ...l, name: l.id, reason: "r" })) });

describe("reading the edits out of an answer", () => {
  it("reads the Apply card proposal as card count changes, and the last proposal wins (#678)", () => {
    const edits = extractAdviceEdits([proposal([{ id: "OP01-001", before: 4, after: 2 }]), proposal([{ id: "OP01-004", before: 1, after: 4 }, { id: "OP01-005", before: 3, after: 0 }])], "-9 OP01-006");
    expect(edits.source).toBe("proposal");
    expect(edits.deltas).toEqual([{ id: "OP01-004", delta: 3 }, { id: "OP01-005", delta: -3 }]);
  });

  it("falls back to the +N / -N lines of the answer when there is no proposal (#678)", () => {
    const edits = extractAdviceEdits([], "Swap these:\n-2 OP01-016\n+2 OP01-017\n+1 OP01-017\n-1 OP01-017");
    expect(edits).toEqual({ source: "text", deltas: [{ id: "OP01-016", delta: -2 }, { id: "OP01-017", delta: 2 }] });
  });

  it("says there are no edits for an answer that changes nothing (#678)", () => {
    expect(extractAdviceEdits([], "Looks fine to me.")).toEqual({ source: "none", deltas: [] });
    expect(extractAdviceEdits([proposal([{ id: "OP01-001", before: 2, after: 2 }])], "")).toEqual({ source: "none", deltas: [] });
  });
});

describe("applying the edits", () => {
  const undo = { source: "text" as const, deltas: [...sab.planted.map((p) => ({ id: p.id, delta: -p.copies })), ...sab.removed.map((r) => ({ id: r.id, delta: r.copies }))] };

  it("applies edits that put the original deck back and finds it legal (#678)", () => {
    const r = applyAdvice(catalog, sab.leaderId, sab.cards, undo);
    expect(r.legal).toBe(true);
    expect(r.cards).toEqual(sab.original);
    expect(r.added).toBe(sab.k);
    expect(r.removed).toBe(sab.k);
  });

  it("flags an edit that leaves 51 cards, or a fifth copy, as illegal (#678)", () => {
    const big = sab.cards.find((c) => c.copies === 4)!;
    const fifth = applyAdvice(catalog, sab.leaderId, sab.cards, { source: "text", deltas: [{ id: big.id, delta: 1 }] });
    expect(fifth.legal).toBe(false);
    expect(fifth.problems.length).toBeGreaterThan(0);
    const extra = applyAdvice(catalog, sab.leaderId, sab.cards, { source: "text", deltas: [{ id: sab.planted[0]!.id, delta: -1 }] });
    expect(extra.legal).toBe(false);
  });

  it("does not call an answer with no edits legal (#678)", () => {
    const r = applyAdvice(catalog, sab.leaderId, sab.cards, { source: "none", deltas: [] });
    expect(r.legal).toBe(false);
    expect(r.problems).toEqual(["the answer has no edits to apply"]);
  });

  it("writes edit lines with additions first (#678)", () => {
    const lines = editLines(catalog, [{ id: "OP01-016", delta: -2 }, { id: "OP01-017", delta: 2 }]);
    expect(lines[0]).toMatch(/^\+2 OP01-017/);
    expect(lines[1]).toMatch(/^-2 OP01-016/);
  });
});

describe("sabotage recall and precision", () => {
  const planted = [{ id: "P1", copies: 2 }, { id: "P2", copies: 2 }];
  const before = [{ id: "P1", copies: 2 }, { id: "P2", copies: 2 }, { id: "C1", copies: 4 }, { id: "C2", copies: 4 }];

  it("counts the planted copies the edits remove over the planted copies, and over all copies removed (#678)", () => {
    // Takes out both P1, one P2 and three C1: 3 of the 4 planted copies, and 3 of the 6 copies it removed were planted.
    const after = [{ id: "P2", copies: 1 }, { id: "C1", copies: 1 }, { id: "C2", copies: 4 }, { id: "N1", copies: 3 }];
    expect(scoreRemoval(planted, before, after)).toEqual({ recall: 0.75, precision: 0.5, plantedRemoved: 3, planted: 4, removed: 6 });
  });

  it("scores zero recall for edits that leave the planted cards in, and counts a card taken out and put back as untouched (#678)", () => {
    expect(scoreRemoval(planted, before, before)).toMatchObject({ recall: 0, precision: null, removed: 0 });
    const swapped = [{ id: "P1", copies: 2 }, { id: "P2", copies: 2 }, { id: "C1", copies: 2 }, { id: "C2", copies: 4 }, { id: "N1", copies: 2 }];
    expect(scoreRemoval(planted, before, swapped)).toMatchObject({ recall: 0, precision: 0, removed: 2 });
  });

  it("gives no recall or precision when nothing was planted (#678)", () => {
    expect(scoreRemoval([], before, [{ id: "C1", copies: 4 }])).toMatchObject({ recall: null, precision: null });
  });
});
