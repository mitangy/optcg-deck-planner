import { beforeEach, describe, expect, it } from "vitest";
import type { GoldfishRun } from "@optcg/rules";
import { loadCatalog } from "./catalog";
import type { Deck } from "./decks";
import { clearSimCache, resolveQuery, simSourceId, simulateDeck, type SimDeps } from "./simulate";

const catalog = loadCatalog();
const noLog: SimDeps = { log: () => {}, yieldNow: async () => {} };

const deckOf = (copies = 50): Deck => ({ leaderId: "ST01-001", cards: [{ id: "OP01-023", copies }], unknown: [], warnings: [] });

const fakeRun = (seed: number): GoldfishRun => ({ seed, mulliganed: false, openingHand: [], winTurn: null, turns: [], firstPlayed: {}, touchedFlagged: false, pilotLifeLost: 0, intents: 0 });

describe("simulate (#402)", () => {
  beforeEach(() => clearSimCache());

  it("gives the same question the same sim: source, and a new one for another dummy Life or game count (#402)", () => {
    const deck = deckOf();
    const base = resolveQuery({ keepCards: ["OP01-023", "OP02-020"], runs: 100 });
    const id = simSourceId(deck, base, 100);
    expect(simSourceId(deck, { ...base, keepCards: ["OP02-020", "OP01-023"] }, 100)).toBe(id);
    expect(simSourceId(deck, { ...base, opponentLife: 4 }, 100)).not.toBe(simSourceId(deck, { ...base, opponentLife: 5 }, 100));
    expect(simSourceId(deck, base, 50)).not.toBe(id);
  });

  it("stops at the time budget and says how many of the requested games it ran (#402)", async () => {
    let clock = 0;
    const result = await simulateDeck(catalog, deckOf(), { runs: 100 }, { ...noLog, now: () => (clock += 7000), budgetMs: 20_000, run: (_setup, seed) => fakeRun(seed) });
    expect(result.setup.runs).toBeLessThan(100);
    expect(result.setup.truncated).toBe(true);
    expect(result.setup.runsRequested).toBe(100);
  });

  it("answers a repeated question from the cache without replaying games (#402)", async () => {
    let played = 0;
    const deps: SimDeps = { ...noLog, run: (_setup, seed) => { played += 1; return fakeRun(seed); } };
    await simulateDeck(catalog, deckOf(), { runs: 10 }, deps);
    const afterFirst = played;
    expect(afterFirst).toBe(10);
    await simulateDeck(catalog, deckOf(), { runs: 10 }, deps);
    expect(played).toBe(afterFirst);
  });

  it("refuses a deck without exactly 50 main-deck cards (#402)", async () => {
    await expect(simulateDeck(catalog, deckOf(49), { runs: 10 }, noLog)).rejects.toThrow(/exactly 50/);
  });

  it("passes the dummy's Life through to the engine: a vanilla deck beats a 0-Life dummy on turn 2 (#402)", async () => {
    const result = await simulateDeck(catalog, deckOf(), { runs: 10, opponentLife: 0, turns: 2, mulligan: "never" }, noLog);
    expect(result.errors.runs).toBe(0);
    expect(result.lethal.byTurn[1]!.percent).toBe(100);
  });
});
