import { describe, expect, it } from "vitest";
import { renderReport, totals } from "./report";
import type { AnswerRow } from "./pipeline";
import { tally, type Outcome } from "./sim";

const res = tally(Array<Outcome>(10).fill("win"));
const sim = (diff: number, lo: number, hi: number): AnswerRow["sim"] => ({ opponents: 3, games_per_opponent: 4, levels: ["normal", "normal"], before: res, after: res, change: { diff, lo, hi }, ceiling: null, vs_ceiling: null });
const row = (over: Partial<AnswerRow>): AnswerRow =>
  ({ case: "x", kind: "sabotaged", leader: "L", k: 5, edit_source: "text", edits: [{ id: "A", delta: 1 }], legal: true, problems: [], recall: 1, precision: 1, sim: null, cost_usd: 0.1, ...over }) as AnswerRow;

const rows = [
  row({ case: "s1", recall: 1, precision: 1, sim: sim(0.2, 0.05, 0.35) }),
  row({ case: "s2", recall: 0, precision: null, edit_source: "none", edits: [], legal: false, sim: { ...sim(0, 0, 0)!, after: null, change: null } }),
  row({ case: "s3", recall: 0.5, precision: 0.5, sim: sim(-0.3, -0.5, -0.1) }),
  row({ case: "m1", kind: "meta", k: null, recall: null, precision: null, sim: sim(-0.05, -0.2, 0.1) }),
];

describe("deck advice totals", () => {
  it("averages recall over the sabotaged cases (no edits counts zero) and precision over those that removed something (#678)", () => {
    const t = totals(rows);
    expect(t.sabotaged).toBe(3);
    expect(t.meanRecall).toBeCloseTo(0.5);
    expect(t.meanPrecision).toBeCloseTo(0.75);
  });

  it("counts an edit as not losing win rate unless its whole interval is below zero (#678)", () => {
    const t = totals(rows);
    expect(t).toMatchObject({ simulated: 3, notLost: 2, gained: 1, withEdits: 3, legal: 3 });
    expect(t.meanChange).toBeCloseTo((0.2 - 0.3 - 0.05) / 3);
  });

  it("states the headline with a case with no edits counted against the edits (#678)", () => {
    const md = renderReport({ variant: "v", mode: "anthropic", model: "m", source: "s", rows, errors: [], stoppedAtCap: false, maxUsd: 5, sim: { gamesPerOpponent: 4, opponents: 3, levels: "normal vs normal" }, banListChecked: true });
    expect(md).toContain("Mean sabotage recall: 50.0%");
    expect(md).toContain("2/3 simulated cases");
    expect(md).toContain("2/4 counting a case with no edits");
    expect(md).toContain("Edits that lost win rate");
    expect(md).toContain("s3");
  });
});
