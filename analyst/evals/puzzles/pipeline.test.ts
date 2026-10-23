import { describe, expect, it } from "vitest";
import { loadCatalog } from "../../src/catalog";
import { CHAT_INSTRUCTIONS, CHAT_MODEL, type CallModel, type ModelReply } from "../../src/chat";
import { scriptedModel, textReply, usage } from "../scripted";
import { gradeAnswer, parseAnswer } from "./answer";
import { askAll, askPuzzle, scriptedReply, type AskDeps, type PuzzleError, type PuzzleRow } from "./pipeline";
import type { Puzzle } from "./types";

const catalog = loadCatalog();

const puzzle = (id: string, gold: Puzzle["gold"] = { key: "power", mode: "number", value: 7000 }): Puzzle => ({
  id,
  type: "power",
  tags: ["plain"],
  newSet: false,
  source: "test",
  position: "Your Leader: Monkey.D.Luffy (ST01-001), active",
  cards: ["ST01-001"],
  question: "What is the power of your Leader Monkey.D.Luffy (ST01-001) right now?",
  schema: '{"power": <number>}',
  message: "Your Leader: Monkey.D.Luffy (ST01-001), active\n\nQuestion: What is the power of your Leader Monkey.D.Luffy (ST01-001) right now?",
  gold,
});

const deps = (callModel: AskDeps["callModel"], over: Partial<AskDeps> = {}): AskDeps => ({
  catalog,
  knowledge: {},
  planner: { mode: "fake", stats: { synthetic: true, responses: {} } },
  callModel,
  model: CHAT_MODEL,
  timeoutS: 30,
  retryMs: 0,
  ...over,
});

const answers = (text: string): CallModel => scriptedModel(() => textReply(text, CHAT_MODEL));
const json = (value: unknown) => `Reasoning.\n\`\`\`json\n${JSON.stringify(value)}\n\`\`\``;

describe("asking a puzzle through the production chat", () => {
  it("sends the puzzle as the player's message with the app's system prompt and tools (#677)", async () => {
    const seen: Record<string, any>[] = []; // eslint-disable-line @typescript-eslint/no-explicit-any
    const spy: CallModel = async (params, onText) => {
      seen.push(structuredClone(params) as Record<string, any>); // eslint-disable-line @typescript-eslint/no-explicit-any
      onText("x");
      return textReply(json({ power: 7000 }), CHAT_MODEL);
    };
    const p = puzzle("p1");
    await askPuzzle(deps(() => spy), p);
    expect(seen).toHaveLength(1);
    const first = seen[0]!.messages[0];
    expect(first.role).toBe("user");
    expect(first.content.map((b: { text: string }) => b.text)).toEqual([p.message]);
    expect(JSON.stringify(seen[0]!.system)).toContain(CHAT_INSTRUCTIONS.trim().slice(0, 60));
    const tools = (seen[0]!.tools as { name: string }[]).map((t) => t.name);
    expect(tools).toEqual(expect.arrayContaining(["get_cards", "search_cards", "analyze_deck", "draw_odds"]));
  });

  it("grades the reply's last JSON block against the gold, exactly (#677)", async () => {
    const run = (text: string) => askPuzzle(deps(() => answers(text)), puzzle("p2")) as Promise<PuzzleRow>;
    expect(await run(json({ power: 7000 }))).toMatchObject({ correct: true, parsed: true, given: "7000", gold: "7000" });
    expect(await run(json({ power: 6000 }))).toMatchObject({ correct: false, parsed: true, given: "6000", gold: "7000" });
    expect(await run("I think 7000.")).toMatchObject({ correct: false, parsed: false, given: "(no answer)" });
    expect(await run(`${json({ power: 6000 })}\nBut then:\n${json({ power: 7000 })}`)).toMatchObject({ correct: true });
  });

  it("records an error, not a wrong answer, when a call is served by another model (#677)", async () => {
    const other: CallModel = async () => ({ ...textReply(json({ power: 7000 }), "claude-other"), model: "claude-other" }) as ModelReply;
    const out = (await askPuzzle(deps(() => other), puzzle("p3"))) as PuzzleError;
    expect(out.failure).toBe("model_mismatch");
  });

  it("charges the calls it made and counts the lookups (#677)", async () => {
    const out = (await askPuzzle(deps(() => answers(json({ power: 7000 }))), puzzle("p4"))) as PuzzleRow;
    expect(out.cost_usd).toBeGreaterThan(0);
    expect(out.usage).toEqual(usage(1500, 200));
    expect(out.rounds).toBe(1);
    expect(out.tool_calls).toBe(0);
  });
});

describe("asking all the puzzles", () => {
  const many = Array.from({ length: 6 }, (_, i) => puzzle(`m${i + 1}`));

  it("stops dispatching once the spend passes the cap, and says so (#677)", async () => {
    const out = await askAll(deps(() => answers(json({ power: 7000 }))), many, { concurrency: 1, maxUsd: 0.0001 });
    expect(out.rows).toHaveLength(1);
    expect(out.stoppedAtCap).toBe(true);
    const all = await askAll(deps(() => answers(json({ power: 7000 }))), many, { concurrency: 3, maxUsd: 100 });
    expect(all.rows).toHaveLength(many.length);
    expect(all.stoppedAtCap).toBe(false);
  });

  it("runs more puzzles at once than the chat allows streams for one player (#677)", async () => {
    const out = await askAll(deps(() => answers(json({ power: 7000 }))), many, { concurrency: 6, maxUsd: 100 });
    expect(out.errors).toEqual([]);
    expect(out.rows).toHaveLength(6);
  });
});

describe("the dry run's scripted replies", () => {
  it("answer most puzzles right, some wrong and some with no JSON, the same way every time (#677)", () => {
    const ps = Array.from({ length: 60 }, (_, i) => puzzle(`d${i}`));
    const replies = ps.map((p) => scriptedReply(p, catalog));
    expect(replies).toEqual(ps.map((p) => scriptedReply(p, catalog)));
    const noJson = replies.filter((r) => !r.includes("```json")).length;
    const wrongFirst = replies.filter((r) => r.includes("deliberately wrong")).length;
    expect(noJson).toBeGreaterThan(0);
    expect(wrongFirst).toBeGreaterThan(5);
    expect(wrongFirst).toBeLessThan(25);
  });

  it("answer a chain with one object: right when it should be, wrong in its first part when it should not (#685)", () => {
    const chain = (id: string): Puzzle => ({
      ...puzzle(id),
      type: "scenario_chain",
      gold: { key: "all", mode: "all", parts: [{ key: "my_life", mode: "number", value: 4 }, { key: "opp_hand", mode: "multiset", value: ["ST01-003", "ST01-009"] }] },
    });
    const graded = Array.from({ length: 40 }, (_, i) => chain(`ch${i}`)).map((p) => ({ p, reply: scriptedReply(p, catalog) }));
    const wrong = graded.filter(({ reply }) => reply.includes("deliberately wrong"));
    expect(wrong.length).toBeGreaterThan(3);
    for (const { p, reply } of wrong) {
      const parsed = parseAnswer(reply);
      expect(gradeAnswer(p.gold, parsed), p.id).toMatchObject({ correct: false, reason: "wrong: my_life" });
    }
    const right = graded.filter(({ reply }) => reply.includes("```json") && !reply.includes("deliberately wrong") && !reply.includes("First thought"));
    expect(right.length).toBeGreaterThan(10);
    for (const { p, reply } of right) expect(gradeAnswer(p.gold, parseAnswer(reply), [{ id: "ST01-003", name: "Karoo" }, { id: "ST01-009", name: "Nefeltari Vivi" }]).correct, p.id).toBe(true);
  });
});
