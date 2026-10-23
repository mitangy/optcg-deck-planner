import { describe, expect, it } from "vitest";
import { wilson } from "../stats";
import type { PuzzleRow } from "./pipeline";
import { headline, puzzlesRunPayload, renderReport, scoreOf, worstMisses } from "./report";

const row = (id: string, type: PuzzleRow["type"], correct: boolean, over: Partial<PuzzleRow> = {}): PuzzleRow => ({
  id,
  type,
  tags: ["plain"],
  newSet: false,
  status: "ok",
  correct,
  parsed: true,
  given: correct ? "7000" : "6000",
  gold: "7000",
  question: `Question of ${id}?`,
  answer: "",
  answer_sha256: "",
  tool_calls: 0,
  rounds: 1,
  latency_s: 1,
  cost_usd: 0.05,
  usage: { input_tokens: 1, output_tokens: 1 },
  retries: 0,
  ...over,
});

const rows = [
  row("a1", "power", true),
  row("a2", "power", true),
  row("a3", "power", false, { newSet: true }),
  row("b1", "playable", true, { newSet: true }),
  row("b2", "playable", false, { parsed: false, given: "(no answer)", reason: "no JSON block in the reply" }),
  row("b3", "playable", false, { given: '["ST01-003"]', gold: '["ST01-003","ST01-009"]' }),
];

describe("the report", () => {
  it("scores the share of puzzles answered exactly right, with a Wilson interval (#677)", () => {
    expect(scoreOf(rows)).toMatchObject({ n: 6, correct: 3, accuracy: 0.5, interval: wilson(3, 6) });
    expect(scoreOf(rows.filter((r) => r.type === "power"))).toMatchObject({ n: 3, correct: 2 });
    expect(headline(rows, [], 0.3)).toBe("puzzles: 50.0% (3/6, 95% Wilson 18.8% to 81.2%), 0 errors, $0.30");
  });

  it("lists accuracy per type and for new sets against older cards (#677)", () => {
    const md = renderReport({ variant: "v", mode: "anthropic", model: "m", source: "s", puzzles: [], rows, errors: [], stoppedAtCap: false, maxUsd: 5 });
    expect(md).toContain("**Headline: 50.0% (3/6, 95% Wilson 18.8% to 81.2%)**");
    expect(md).toContain("| power | 3 | 2 | 66.7% |");
    expect(md).toContain("| playable | 3 | 1 | 33.3% |");
    expect(md).toContain("| **all** | 6 | 3 | 50.0% |");
    expect(md).toContain("| a card from OP18 or EB05 is in the position | 2 | 50.0% |");
    expect(md).toContain("| older cards only | 4 | 50.0% |");
    expect(md).toContain("Spend: $0.30 of $5.00.");
  });

  it("shows the worst misses with the question, what was given and the gold, unanswered ones first (#677)", () => {
    expect(worstMisses(rows).map((r) => r.id)).toEqual(["b2", "a3", "b3"]);
    const md = renderReport({ variant: "v", mode: "anthropic", model: "m", source: "s", puzzles: [], rows, errors: [], stoppedAtCap: false, maxUsd: 5 });
    expect(md).toContain('- b3 [plain] Question of b3? Given ["ST01-003"]; gold ["ST01-003","ST01-009"].');
    expect(md).toContain("- b2 [plain] Question of b2? Given (no answer) (no JSON block in the reply); gold 7000.");
  });

  it("keeps errors out of the accuracy and lists them (#677)", () => {
    const md = renderReport({ variant: "v", mode: "scripted", model: "m", source: "s", puzzles: [], rows, errors: [{ id: "e1", failure: "timeout", message: "no answer within 30s", retries: 0 }], stoppedAtCap: true, maxUsd: 5 });
    expect(md).toContain("| **all** | 6 | 3 |");
    expect(md).toContain("- e1: timeout: no answer within 30s");
    expect(md).toContain("Dry run:");
    expect(md).toContain("Stopped at the spend cap.");
  });

  it("lists the harder types by name, in the table and in the posted groups (#685)", () => {
    const more = [row("d1", "defend", true), row("d2", "defend", false), row("l1", "lethal", true), row("c1", "scenario_chain", false, { reason: "wrong: my_hand" })];
    const md = renderReport({ variant: "v", mode: "anthropic", model: "m", source: "s", puzzles: [], rows: more, errors: [], stoppedAtCap: false, maxUsd: 5 });
    expect(md).toContain("| defend | 2 | 1 | 50.0% |");
    expect(md).toContain("| lethal | 1 | 1 | 100.0% |");
    expect(md).toContain("| scenario_chain | 1 | 0 | 0.0% |");
    expect(md).toContain("(wrong: my_hand)");
    expect(puzzlesRunPayload({ variant: "v", model: "m", rows: more }).groups).toEqual({ defend: { correct: 1, total: 2 }, lethal: { correct: 1, total: 1 }, scenario_chain: { correct: 0, total: 1 } });
  });
});
