import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Intent, MatchState, Seat } from "../types.js";
import type { PositionOption } from "../bot/analysis.js";

/** Win chances (0..1) the stubbed analysis returns for the n-th ranked decision: the played move's and the others'. */
let plan: (n: number, others: number) => { played: number; others: number[] } | "unmatched";
let calls: { step: number; seat: Seat }[] = [];
let winOf: (state: MatchState, seat: Seat) => number = () => 0.5;
let reverseKeys = false;
let includes: (Intent[] | undefined)[] = [];

vi.mock("../bot/analysis.js", async () => {
  const { getPlayerView } = await import("../engine.js");
  const { stableJson } = await import("../review/classify.js");
  return {
    winProbability: (s: MatchState, seat: Seat) => winOf(s, seat),
    rankOptions: (state: MatchState, seat: Seat, o: { include?: Intent[] } = {}) => {
      includes.push(o.include);
      const n = calls.length;
      const played = currentReplay.intents[currentStep]!.intent;
      calls.push({ step: currentStep, seat });
      const legal = getPlayerView(state, seat).legalIntents.filter((i) => stableJson(i) !== stableJson(played));
      const p = plan(n, legal.length);
      const flip = (i: Intent) => (reverseKeys ? (Object.fromEntries(Object.entries(i).reverse()) as Intent) : i);
      const opts: PositionOption[] = [];
      const mk = (intent: Intent, winChance: number): PositionOption => ({ intent, label: `L:${stableJson(intent)}`, winChance, samples: 1, isBotPick: false });
      if (p !== "unmatched") opts.push(mk(flip(played), p.played));
      legal.forEach((i, k) => opts.push(mk(i, p === "unmatched" ? 0.5 : (p.others[k] ?? p.others[p.others.length - 1] ?? 0))));
      return opts.sort((a, b) => b.winChance - a.winChance);
    },
  };
});

import { createGameReviewer, reviewGame } from "../review/gameReview.js";
import { getPlayerView } from "../engine.js";
import { MATCH_REPLAY_SCHEMA, replayApply, replayStart, type MatchReplay } from "../replay/matchReplay.js";
import { expandDeck, loadFixture } from "../testing/replay.js";

let currentReplay: MatchReplay;
let currentStep = 0;

function golden(maxIntents: number): MatchReplay {
  const f = loadFixture("purple-red-full-game");
  return {
    schema: MATCH_REPLAY_SCHEMA, rulesVersion: "test", registryHash: "test", seed: f.seed, firstSeat: f.firstSeat,
    skipMulligans: true, lifeCheckEveryHit: true, privateChoicesV2: true,
    players: [{ leaderId: f.players[0].leaderId, deck: expandDeck(f.players[0].deck) }, { leaderId: f.players[1].leaderId, deck: expandDeck(f.players[1].deck) }],
    intents: f.intents.slice(0, maxIntents),
  };
}

/** Independent walk: the steps whose seat had more than one legal intent. */
function multiOptionSteps(replay: MatchReplay): number[] {
  const out: number[] = [];
  let s = replayStart(replay);
  replay.intents.forEach(({ seat }, i) => {
    if (getPlayerView(s, seat).legalIntents.length > 1) out.push(i);
    s = replayApply(s, replay, i).state;
  });
  return out;
}

// The stub needs to know which step is being ranked: the reviewer walks in order, so track it from the call count.
function use(replay: MatchReplay) {
  currentReplay = replay;
  const steps = multiOptionSteps(replay);
  Object.defineProperty(globalThis, "__steps", { value: steps, configurable: true });
  return steps;
}
// currentStep follows the n-th decision.
const stepFor = (steps: number[]) => (n: number) => steps[n]!;

beforeEach(() => {
  calls = [];
  includes = [];
  winOf = () => 0.5;
  reverseKeys = false;
  plan = () => ({ played: 0.5, others: [0.4] });
});

function run(replay: MatchReplay, opts = {}) {
  const steps = use(replay);
  const pick = stepFor(steps);
  // Keep currentStep in step with the stub's call counter.
  const origPush = calls.push.bind(calls);
  calls.push = (...a) => { const r = origPush(...a); currentStep = pick(calls.length); return r; };
  currentStep = pick(0);
  return { review: reviewGame(replay, { budgetMs: 1, samples: 1, ...opts }), steps };
}

describe("game review (#967)", () => {
  const replay = golden(40);

  it("only decisions with more than one legal intent are ranked; forced ones are counted and skipped (#967)", () => {
    const { review, steps } = run(replay);
    expect(steps.length).toBeGreaterThan(5);
    expect(steps.length).toBeLessThan(replay.intents.length);
    expect(review.moves.map((m) => m.step)).toEqual(steps);
    expect(review.forced).toBe(replay.intents.length - steps.length);
    expect(calls).toHaveLength(steps.length);
  });

  it("asks the analysis to score the played intent even if the bot would not consider it (#967)", () => {
    const { review } = run(replay);
    expect(includes).toHaveLength(review.moves.length);
    review.moves.forEach((m, k) => expect(includes[k]).toEqual([m.played.intent]));
  });

  it("grades the played move by best minus played win chance, in points (#967)", () => {
    plan = () => ({ played: 0.5, others: [0.6, 0.3] });
    const { review } = run(replay);
    for (const m of review.moves) {
      expect(m.playedWin).toBeCloseTo(50);
      expect(m.bestWin).toBeCloseTo(60);
      expect(m.loss).toBeCloseTo(10);
      expect(m.cls).toBe("inaccuracy");
      expect(m.best.label).toMatch(/^L:/);
    }
    expect(review.seats[0].counts.inaccuracy + review.seats[1].counts.inaccuracy).toBe(review.moves.length);
  });

  it("matches the played intent by content even when the ranked copy lists its keys in another order (#967)", () => {
    plan = () => ({ played: 0.9, others: [0.2] });
    reverseKeys = true;
    const { review } = run(replay);
    expect(review.moves.every((m) => m.cls === "great" && m.loss === 0)).toBe(true);
    expect(review.moves.every((m) => m.playedWin !== null && m.score === 100)).toBe(true);
  });

  it("a played move missing from the ranked options gets no class and is counted as unranked (#967)", () => {
    plan = () => "unmatched";
    const { review } = run(replay);
    expect(review.moves.every((m) => m.cls === null && m.loss === null && m.playedWin === null && m.score === null)).toBe(true);
    expect(review.seats[0].graded + review.seats[1].graded).toBe(0);
    expect(review.seats[0].unranked + review.seats[1].unranked).toBe(review.moves.length);
    expect(review.seats[0].accuracy).toBeNull();
  });

  it("accuracy is the mean of the decision scores per seat (#967)", () => {
    // Alternate a clean move and a 20-point loss, so the mean sits between the two scores.
    plan = (n) => (n % 2 === 0 ? { played: 0.7, others: [0.3] } : { played: 0.4, others: [0.6] });
    const { review } = run(replay);
    for (const seat of [0, 1] as const) {
      const mine = review.moves.filter((m) => m.seat === seat && m.score !== null);
      if (!mine.length) continue;
      const mean = mine.reduce((a, m) => a + m.score!, 0) / mine.length;
      expect(review.seats[seat].accuracy).toBeCloseTo(mean, 8);
      expect(review.seats[seat].graded).toBe(mine.length);
    }
    const scores = new Set(review.moves.map((m) => Math.round(m.score!)));
    expect(scores.size).toBe(2);
  });

  it("a turn is good when the seat's win probability rises 8 points by the next turn start and nothing was an Inaccuracy (#967)", () => {
    // Seat 0 gains 10 points per turn, seat 1 loses them.
    winOf = (s, seat) => (seat === 0 ? 0.3 + 0.01 * s.turnNumber * 10 : 0.7 - 0.1 * s.turnNumber);
    const clean = run(replay).review;
    // The next point is the seat's own next turn start, two turn numbers on: +-20 points.
    const activeWithNext = clean.turns.filter((t) => t.active && t.gain !== null && t.turn <= 4);
    expect(activeWithNext.length).toBeGreaterThan(2);
    for (const t of activeWithNext) {
      expect(t.gain).toBeCloseTo(t.seat === 0 ? 20 : -20);
      expect(t.goodTurn).toBe(t.seat === 0);
    }
    // With no later turn of its own, the last turn is measured against the end of the game (here, turn 6).
    const last = clean.turns.find((t) => t.turn === 5 && t.active)!;
    expect(last.gain).toBeCloseTo(10);
    expect(last.goodTurn).toBe(true);
    // Make every decision an Inaccuracy: no turn is good any more.
    calls = [];
    plan = () => ({ played: 0.5, others: [0.6] });
    const sloppy = run(replay).review;
    expect(sloppy.turns.some((t) => t.active && t.gain !== null && t.seat === 0)).toBe(true);
    expect(sloppy.turns.every((t) => !t.goodTurn)).toBe(true);
    expect(sloppy.turns.filter((t) => t.decisions > 0).every((t) => t.worstClass === "inaccuracy")).toBe(true);
  });

  it("turn win probabilities are recorded for both seats at each turn start plus the end (#967)", () => {
    winOf = (_s, seat) => (seat === 0 ? 0.25 : 0.75);
    const { review } = run(replay);
    expect(review.evals[0]).toMatchObject({ step: 0, win: [25, 75] });
    expect(review.evals.at(-1)!.final).toBe(true);
    const turns = review.evals.filter((e) => !e.final).map((e) => e.turn);
    expect(new Set(turns).size).toBe(turns.length);
    expect(turns).toEqual([...turns].sort((a, b) => a - b));
  });

  it("the mulligan before the first turn is not a turn of its own: no \"turn 0\" summary or good turn (#986)", () => {
    // A game played with mulligans starts at turn number 0 (the mulligan phase) and turn 1 begins once both are done.
    const base = golden(30);
    const first = base.firstSeat;
    const withMulligans: MatchReplay = {
      ...base,
      skipMulligans: false,
      intents: [
        { seat: first, intent: { type: "mulligan", doMulligan: false } },
        { seat: (1 - first) as Seat, intent: { type: "mulligan", doMulligan: false } },
        ...base.intents,
      ],
    };
    // The win chance rises while the mulligan phase is open, so a "turn 0" would count as a good one.
    winOf = (s) => (s.turnNumber === 0 ? 0.3 : 0.6);
    const { review } = run(withMulligans);
    expect(review.evals[0]).toMatchObject({ step: 0, turn: 0 });
    expect(review.evals.some((e) => e.turn === 1)).toBe(true);
    expect(review.turns.filter((t) => t.turn < 1 && t.active)).toEqual([]);
    expect(review.turns.some((t) => t.turn < 1 && t.goodTurn)).toBe(false);
    expect(review.turns.some((t) => t.turn === 1 && t.active)).toBe(true);
  });

  it("a replay that diverges is reviewed up to the bad intent and says where (#967)", () => {
    const base = golden(40);
    const bad = 12;
    const wrongSeat = (1 - base.intents[bad]!.seat) as Seat;
    const broken: MatchReplay = { ...base, intents: base.intents.map((x, i) => (i === bad ? { seat: wrongSeat, intent: { type: "end_turn" } } : x)) };
    currentReplay = broken;
    const steps = multiOptionSteps({ ...broken, intents: broken.intents.slice(0, bad) });
    Object.assign(globalThis, {});
    currentStep = steps[0]!;
    const origPush = calls.push.bind(calls);
    calls.push = (...a) => { const r = origPush(...a); currentStep = steps[calls.length] ?? 0; return r; };
    const review = reviewGame(broken, { budgetMs: 1, samples: 1 });
    expect(review.diverged?.atIntent).toBe(bad);
    expect(review.diverged?.message).toMatch(/diverged at intent 12/);
    expect(review.moves.every((m) => m.step < bad)).toBe(true);
    expect(review.moves).toHaveLength(steps.length);
  });

  it("advance(n) reviews n ranked decisions at a time and reports progress (#967)", () => {
    const steps = use(replay);
    const pick = stepFor(steps);
    const origPush = calls.push.bind(calls);
    calls.push = (...a) => { const r = origPush(...a); currentStep = pick(calls.length); return r; };
    currentStep = pick(0);
    const r = createGameReviewer(replay, { budgetMs: 1, samples: 1 });
    expect(r.progress()).toBe(0);
    expect(r.advance(2)).toBe(false);
    expect(r.result().moves).toHaveLength(2);
    const mid = r.progress();
    expect(mid).toBeGreaterThan(0);
    expect(mid).toBeLessThan(1);
    expect(r.advance(Number.MAX_SAFE_INTEGER)).toBe(true);
    expect(r.progress()).toBe(1);
    expect(r.result().moves).toHaveLength(steps.length);
  });

  it("only the chosen seats are reviewed (#967)", () => {
    const { review } = run(replay, { seats: [1] });
    expect(review.moves.length).toBeGreaterThan(0);
    expect(review.moves.every((m) => m.seat === 1)).toBe(true);
  });
});
