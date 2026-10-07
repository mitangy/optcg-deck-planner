import { describe, expect, it } from "vitest";
import { createSeededRng } from "../rng.js";
import { randomDeck } from "../sim/fuzz.js";
import { bestDeploy, goldfishRun, shouldMulligan, summarizeGoldfish, wilsonPercent, type GoldfishSetup } from "../sim/goldfish.js";

const VANILLA = Array<string>(50).fill("OP01-023");

const setupFor = (over: Partial<GoldfishSetup> = {}): GoldfishSetup => ({
  leaderId: "ST01-001",
  deck: VANILLA,
  goingFirst: true,
  turns: 2,
  opponentLife: 5,
  opponentPower: 5000,
  mulligan: "never",
  keepCards: [],
  line: "auto",
  track: [],
  ...over,
});

const play = (setup: GoldfishSetup, seeds = [1, 2, 3]) =>
  seeds.map((seed) => {
    const run = goldfishRun(setup, seed);
    expect(run.error).toBeUndefined();
    return run;
  });

const slots = (cands: Parameters<typeof bestDeploy>[0], don: number) => bestDeploy(cands, don).map((c) => c.idx).sort((a, b) => a - b);

describe("goldfish pilot (#402)", () => {
  it("goldfish plays the hand that spends the most DON!!, not the single biggest card (#402)", () => {
    expect(slots([{ idx: 0, cost: 3, power: 5000 }, { idx: 1, cost: 2, power: 4000 }, { idx: 2, cost: 2, power: 4000 }], 4)).toEqual([1, 2]);
  });

  it("goldfish prefers two cards to one when they spend the same DON!! (#402)", () => {
    expect(slots([{ idx: 0, cost: 4, power: 6000 }, { idx: 1, cost: 2, power: 3000 }, { idx: 2, cost: 2, power: 3000 }], 4)).toEqual([1, 2]);
  });

  it("goldfish auto mulligan keeps a hand with a Character costing 3 or less, and never keeps everything (#402)", () => {
    const rule = { mulligan: "auto" as const, keepCards: [] };
    expect(shouldMulligan(["OP01-023", "OP02-007", "OP02-020", "OP12-005", "EB02-004"], rule)).toBe(false);
    const heavy = ["OP06-005", "OP02-007", "OP02-020", "OP12-005", "EB02-004"];
    expect(shouldMulligan(heavy, rule)).toBe(true);
    expect(shouldMulligan(heavy, { ...rule, mulligan: "never" })).toBe(false);
  });

  it("goldfish keepCards mulligans every hand without one of them, however cheap (#402)", () => {
    const rule = { mulligan: "auto" as const, keepCards: ["OP02-020"] };
    expect(shouldMulligan(["OP01-010", "OP01-012", "OP01-023", "EB01-005", "OP04-007"], rule)).toBe(true);
    expect(shouldMulligan(["OP02-020", "OP12-005", "OP06-005", "OP02-007", "EB02-004"], rule)).toBe(false);
  });

  it("goldfish auto line goes face first when developing would miss lethal (#402)", () => {
    const base = setupFor({ opponentLife: 0, opponentPower: 7000, turns: 2 });
    expect(play({ ...base, line: "develop" }).map((r) => r.winTurn)).toEqual([null, null, null]);
    expect(play({ ...base, line: "auto" }).map((r) => r.winTurn)).toEqual([2, 2, 2]);
  });

  it("the goldfish dummy never attacks or counters (#402)", () => {
    const second = play(setupFor({ goingFirst: false, turns: 4, opponentLife: 5, line: "develop" }));
    expect(second.map((r) => r.pilotLifeLost)).toEqual([0, 0, 0]);
    expect(play(setupFor({ opponentLife: 0, opponentPower: 5000, line: "develop", turns: 2 })).map((r) => r.winTurn)).toEqual([2, 2, 2]);
  });

  it("the goldfish dummy starts at the asked Life (#402)", () => {
    for (const run of play(setupFor({ opponentLife: 2, line: "develop", turns: 2 }))) expect(run.turns[1]!.opponentLife).toBe(1);
    expect(play(setupFor({ opponentLife: 0, line: "develop", turns: 2 })).map((r) => r.winTurn)).toEqual([2, 2, 2]);
  });

  it("the goldfish dummy's Leader has the asked power (#402)", () => {
    for (const run of play(setupFor({ opponentLife: 0, opponentPower: 9000, line: "develop", turns: 3 }))) {
      expect(run.winTurn).toBeNull();
      expect(run.turns.map((t) => t.hits)).toEqual([0, 0, 0]);
    }
  });

  it("the same seed replays the same goldfish run and another seed doesn't (#402)", () => {
    const { leaderId, deck } = randomDeck(createSeededRng(3), undefined, "ST01-001");
    const setup = setupFor({ leaderId, deck, turns: 5, opponentLife: 4, mulligan: "auto" });
    const a = goldfishRun(setup, 7);
    expect(goldfishRun(setup, 7)).toEqual(a);
    const b = goldfishRun(setup, 8);
    expect(JSON.stringify([b.openingHand, b.turns])).not.toBe(JSON.stringify([a.openingHand, a.turns]));
  });

  it("goldfish counts a game as affected only when it plays a card the engine doesn't fully support (#402)", () => {
    const deck = [...Array<string>(46).fill("OP01-023"), ...Array<string>(4).fill("OP02-020")];
    const supportOf = (id: string) => (id === "OP02-020" ? ("partial" as const) : ("ok" as const));
    const seeds = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
    const early = setupFor({ deck, supportOf, turns: 3 });
    const earlySummary = summarizeGoldfish(early, play(early, seeds));
    expect(earlySummary.flagged).toEqual([{ id: "OP02-020", support: "partial" }]);
    expect(earlySummary.runsAffected).toBe(0);
    const late = setupFor({ deck, supportOf, turns: 7 });
    const lateRuns = play(late, seeds);
    const played = lateRuns.filter((r) => "OP02-020" in r.firstPlayed).length;
    expect(played).toBeGreaterThan(0);
    expect(summarizeGoldfish(late, lateRuns).runsAffected).toBe(played);
  });

  it("goldfish win-by-turn intervals are 95% Wilson intervals, never zero-width at 0 wins (#402)", () => {
    expect(wilsonPercent(37, 100)).toEqual([28.2, 46.8]);
    expect(wilsonPercent(0, 100)[1]).toBe(3.7);
  });
});
