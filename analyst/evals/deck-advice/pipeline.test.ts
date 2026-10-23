import { describe, expect, it } from "vitest";
import { loadCatalog } from "../../src/catalog";
import { CHAT_INSTRUCTIONS, CHAT_MODEL, type CallModel } from "../../src/chat";
import { loadPlaybook } from "../../src/playbook";
import { PROPOSE_TOOL } from "../../src/proposals";
import { instructionsFor } from "../../src/server";
import { scriptedModel, textReply } from "../scripted";
import { buildCases, type AdviceCase } from "./cases";
import { fixtureDecks } from "./fixture";
import { evaluateCase, simDeck, type PipelineDeps, type SimConfig } from "./pipeline";
import { metaFrequency } from "./sabotage";
import { scriptedAdviceModel, scriptedDeltas } from "./scriptedAdvice";
import { inProcess, type SimJob, type SimRun } from "./sim";

const catalog = loadCatalog();
const decks = fixtureDecks();
const freq = metaFrequency(decks);
const cases = buildCases(catalog, decks, { mode: "all", seed: 1 });
const sabotaged = cases.find((c) => c.kind === "sabotaged")!;
const ask = { catalog, knowledge: { playbook: loadPlaybook() }, planner: { mode: "fake" as const, stats: { synthetic: true as const, responses: {} } }, model: CHAT_MODEL, timeoutS: 60 };
const deps = (base: CallModel, sim: SimConfig | null = null): PipelineDeps => ({ ask, base, sim });
const textLines = (c: AdviceCase) => [...c.planted.map((p) => `-${p.copies} ${p.id}`), ...c.removed.map((r) => `+${r.copies} ${r.id}`)].join("\n");
const counting = () => {
  const jobs: SimJob[] = [];
  const run: SimRun = async (batch) => (jobs.push(...batch), inProcess(batch));
  return { jobs, cfg: { field: decks, games: 1, seed: 3, levels: ["normal", "normal"], run, cache: new Map() } as SimConfig };
};

describe("asking Log Pose", () => {
  it("sends the production system prompt and tools, with the deck pasted under the question and open in the app (#678)", async () => {
    const seen: Record<string, any>[] = []; // eslint-disable-line @typescript-eslint/no-explicit-any
    const spy: CallModel = async (params, onText) => {
      seen.push(structuredClone(params));
      onText("ok");
      return textReply("ok", CHAT_MODEL);
    };
    await evaluateCase(deps(spy), sabotaged);
    const p = seen[0]!;
    expect(p.system.map((b: { text: string }) => b.text).join("")).toBe(instructionsFor(true) + CHAT_INSTRUCTIONS);
    const tools = p.tools.map((t: { name: string }) => t.name);
    expect(tools).toContain(PROPOSE_TOOL);
    expect(tools).toContain("analyze_deck");
    const text = p.messages[0].content.map((b: { text: string }) => b.text).join("\n");
    expect(text).toContain("open deck:");
    expect(text).toContain(sabotaged.message);
  });
});

describe("a case through the pipeline", () => {
  it("reads both the Apply card and +N / -N lines, and scores the planted cards the edits removed (#678)", async () => {
    const rows = [];
    for (const c of cases) rows.push(await evaluateCase(deps(scriptedAdviceModel(catalog, c, freq, CHAT_MODEL)), c));
    expect(rows.some((r) => r.edit_source === "proposal")).toBe(true);
    expect(rows.some((r) => r.edit_source === "text")).toBe(true);
    for (const r of rows) {
      const c = cases.find((x) => x.id === r.case)!;
      const want = scriptedDeltas(catalog, c, freq).sort((a, b) => a.id.localeCompare(b.id));
      expect([...r.edits].sort((a, b) => a.id.localeCompare(b.id))).toEqual(want);
      if (want.length) expect(r.legal).toBe(true);
      if (r.kind === "sabotaged") {
        expect(r.planted).toBe(c.k);
        expect(r.recall).toBeCloseTo(r.planted_removed / c.k!);
        expect(r.recall).toBeGreaterThan(0);
        expect(r.recall).toBeLessThan(1);
      } else {
        expect(r.recall).toBeNull();
      }
    }
  });

  it("scores an answer that puts the original deck back as full recall, and plays that deck once for the edit and the ceiling (#678)", async () => {
    const { jobs, cfg } = counting();
    const undo = scriptedModel(() => textReply(`Put these back:\n${textLines(sabotaged)}`, CHAT_MODEL));
    const r = await evaluateCase(deps(undo, cfg), sabotaged);
    expect(r).toMatchObject({ edit_source: "text", legal: true, recall: 1, precision: 1 });
    expect(r.sim!.after).toEqual(r.sim!.ceiling);
    expect(r.sim!.vs_ceiling!.diff).toBe(0);
    // The sabotaged deck and the original, each against the three other decks once.
    expect(jobs).toHaveLength(2 * (decks.length - 1) * cfg.games);
  });

  it("leaves the case's own deck out of its opposing field (#678)", async () => {
    const { jobs, cfg } = counting();
    await simDeck(cfg, sabotaged, sabotaged.cards);
    expect(jobs).toHaveLength((decks.length - 1) * cfg.games);
    expect(jobs.every((j) => j.opp.leaderId !== sabotaged.leaderId)).toBe(true);
  });

  it("does not play an illegal edit, and reports the win rate of the deck the player had (#678)", async () => {
    const { jobs, cfg } = counting();
    const big = sabotaged.cards.find((c) => c.copies === 4)!;
    const bad = scriptedModel(() => textReply(`+1 ${big.id}`, CHAT_MODEL));
    const r = await evaluateCase(deps(bad, cfg), sabotaged);
    expect(r).toMatchObject({ edit_source: "text", legal: false });
    expect(r.sim).toMatchObject({ after: null, change: null, vs_ceiling: null });
    expect(r.sim!.before.games).toBe(decks.length - 1);
    expect(jobs.length).toBe(2 * (decks.length - 1));
  });
});
