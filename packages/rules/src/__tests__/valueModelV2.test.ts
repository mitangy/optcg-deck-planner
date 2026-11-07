import { describe, expect, it } from "vitest";
import { actingSeat } from "../bot/index.js";
import { denseFeaturesV2, extractFeatures, extractFeaturesV2, FEATURE_NAMES, FEATURE_NAMES_V2 } from "../bot/features.js";
import { peekNormalIntent } from "../bot/policy.js";
import { candidatesFor, searchCandidates } from "../bot/search.js";
import { learnedLogit, logitOf, logitOfParts, sigmoid, VALUE_WEIGHTS, type MlpModel, type ValueWeights } from "../bot/valueModel.js";
import { getPlayerView } from "../engine.js";
import { replayMatch } from "../matchReplay.js";
import { createSeededRng } from "../rng.js";
import { buildVocab, CardTable, fitBatched, fitFlags, type Sample } from "../sim/fitValue.js";
import { playBotGame } from "../sim/selfPlay.js";
import { Harness } from "../testing/harness.js";
import type { MatchState, Seat } from "../types.js";
import metaDecks from "./fixtures/meta-decks.json";

const META = metaDecks as { name: string; leaderId: string; deck: string[] }[];
const COUNTER = "OP01-006"; // a Character with a 2000 Counter
const FILLER_CARD = "ST01-003";
const RED = "OP01-001";
const RED_GREEN = "ST30-001";
const BLUE = "OP17-039";

/** A 2-input, 2-hidden-unit network with one card (two bag slots), small enough to evaluate by hand. */
const tiny = (): MlpModel => ({
  kind: "mlp",
  featureSet: "v2",
  names: ["a", "b"],
  vocab: ["X"],
  mean: [1, 0],
  std: [2, 1],
  // columns: a, b, X field_diff, X hand
  hidden: { W1: [[1, 2, 3, 4], [-1, 1, 0, -2]], b1: [0.5, 0.25], w2: [2, 3], b2: -1 },
});

describe("mlp value model inference", () => {
  it("applies the ReLU: a hidden unit below zero adds nothing (#value-model)", () => {
    // Standardised input (3-1)/2 = 1 and -1: unit 0 = 0.5 + 1 - 2 = -0.5 (off), unit 1 = 0.25 - 1 - 1 = -1.75 (off) -> only b2.
    expect(logitOf([3, -1], tiny())).toBeCloseTo(-1, 10);
    // Input (5-1)/2 = 2 and 1: unit 0 = 0.5 + 2 + 2 = 4.5, unit 1 = 0.25 - 2 + 1 = -0.75 (off) -> 2 * 4.5 - 1.
    expect(logitOf([5, 1], tiny())).toBeCloseTo(8, 10);
  });

  it("standardises the dense inputs with mean and std before the first layer (#value-model)", () => {
    // Both variants standardise a to 1, so both give 2 * 3.5 + 3 * 0.25 - 1.
    const wide = tiny();
    wide.std = [4, 1]; // (5-1)/4 = 1 -> unit 0 = 0.5 + 1 + 2 = 3.5, unit 1 = 0.25 - 1 + 1 = 0.25
    expect(logitOf([5, 1], wide)).toBeCloseTo(6.75, 10);
    const shifted = tiny();
    shifted.mean = [3, 0]; // (5-3)/2 = 1, the same inputs
    expect(logitOf([5, 1], shifted)).toBeCloseTo(6.75, 10);
  });

  it("feeds the sparse card bag through the matching W1 columns without standardising it (#value-model)", () => {
    // (5, 1) gives unit 0 = 4.5; the bag adds field_diff 2 * 3 + hand 1 * 4 = 10 to unit 0 and 0 * 2 + 1 * -2 = -2 to unit 1 (-0.75 -> -2.75, off).
    expect(logitOfParts(tiny(), [5, 1], [0, 1], [2, 1])).toBeCloseTo(2 * 14.5 - 1, 10);
    // Only the hand slot: unit 0 = 4.5 + 4 = 8.5; unit 1 = -0.75 - 2 = -2.75.
    expect(logitOfParts(tiny(), [5, 1], [1], [1])).toBeCloseTo(2 * 8.5 - 1, 10);
  });
});

describe("feature set v2", () => {
  it("never reads the opponent's hand contents, only mine goes into the card bag (#value-model)", () => {
    const h = new Harness({ leaders: [RED, RED] });
    h.hand(0, COUNTER, COUNTER, FILLER_CARD);
    h.field(0, COUNTER);
    h.field(1, FILLER_CARD);
    h.hand(1, COUNTER, COUNTER);
    const vocab = [COUNTER, FILLER_CARD];
    const f = extractFeaturesV2(h.state, 0, vocab);
    const bag = Object.fromEntries(f.idx.map((k, i) => [k, f.val[i]]));
    // slot = 2 * card + (0: my field - their field, 1: my hand)
    expect(bag).toEqual({ 0: 1, 2: -1, 1: 2, 3: 1 });

    const other = structuredClone(h.state);
    for (const c of other.players[1].hand) c.defId = FILLER_CARD;
    const g = extractFeaturesV2(other, 0, vocab);
    expect(g).toEqual(f);
  });

  it("sets leader colour one-hots for both sides (a two-colour leader sets both) and interacts only my colours with the diffs (#value-model)", () => {
    const h = new Harness({ leaders: [RED_GREEN, BLUE] });
    const p1 = h.state.players[1];
    p1.life.splice(0, 2);
    p1.faceUpLife.splice(0, 2);
    p1.zoneInstanceIds.life.splice(0, 2);
    const at = (x: number[], name: string): number => x[FEATURE_NAMES_V2.indexOf(name as never)]!;
    const x = denseFeaturesV2(h.state, 0);
    expect(x).toHaveLength(FEATURE_NAMES_V2.length);
    expect([at(x, "leader_me_red"), at(x, "leader_me_green"), at(x, "leader_me_blue")]).toEqual([1, 1, 0]);
    expect([at(x, "leader_opp_red"), at(x, "leader_opp_blue")]).toEqual([0, 1]);
    const lifeDiff = at(x, "life_diff");
    expect(lifeDiff).not.toBe(0);
    expect(at(x, "leader_me_red_x_life_diff")).toBe(lifeDiff);
    expect(at(x, "leader_me_green_x_life_diff")).toBe(lifeDiff);
    expect(at(x, "leader_me_blue_x_life_diff")).toBe(0);
    // The other seat's view swaps the sides.
    const y = denseFeaturesV2(h.state, 1);
    expect([at(y, "leader_me_blue"), at(y, "leader_me_red"), at(y, "leader_opp_red"), at(y, "leader_opp_green")]).toEqual([1, 0, 1, 1]);
    expect(at(y, "leader_me_blue_x_life_diff")).toBe(at(y, "life_diff"));
  });

  it("starts with exactly the v1 feature vector of the same seat (#value-model)", () => {
    const h = new Harness({ leaders: [RED, BLUE] });
    h.hand(0, COUNTER, COUNTER);
    h.field(1, FILLER_CARD);
    for (const seat of [0, 1] as Seat[]) expect(denseFeaturesV2(h.state, seat).slice(0, FEATURE_NAMES.length)).toEqual(extractFeatures(h.state, seat));
  });

  it("learnedLogit uses the v2 extractor and the bag weights for a v2 linear model (#value-model)", () => {
    const h = new Harness({ leaders: [RED, BLUE] });
    h.hand(0, COUNTER, COUNTER);
    const weights = new Array<number>(FEATURE_NAMES_V2.length).fill(0);
    weights[FEATURE_NAMES_V2.indexOf("leader_me_red")] = 2;
    const model: ValueWeights = { featureSet: "v2", names: [...FEATURE_NAMES_V2], weights, bias: 0.5, vocab: [FILLER_CARD, COUNTER], bagWeights: [0, 0, 0, 3] };
    // bias + red leader + 3 per COUNTER copy in hand
    expect(learnedLogit(h.state, 0, model)).toBeCloseTo(0.5 + 2 + 3 * 2, 10);
  });
});

describe("fitting the card bag", () => {
  /** Positions whose label is "card A is in my hand"; everything else is noise. */
  function bagCorpus(): { samples: Sample[]; table: CardTable } {
    const r = createSeededRng(9);
    const table = CardTable.from(["A", "B"]);
    const samples: Sample[] = Array.from({ length: 500 }, (_, i) => {
      const hasA = r.nextInt(2) === 1;
      const sp: number[] = [];
      if (hasA) sp.push(1, 1); // card 0, hand slot
      if (r.nextInt(2) === 1) sp.push(2, 1); // card 1, field slot: noise
      return { x: FEATURE_NAMES_V2.map(() => (r.nextInt(2000) - 1000) / 1000), y: hasA ? 1 : 0, hand: 0, turn: 1, game: i, sp };
    });
    return { samples, table };
  }
  const accuracy = (samples: Sample[], table: CardTable, model: ValueWeights | MlpModel): number => {
    const at = new Map(model.vocab!.map((id, i) => [id, i]));
    let ok = 0;
    for (const s of samples) {
      const idx: number[] = [];
      const val: number[] = [];
      for (let k = 0; k < s.sp!.length; k += 2) {
        const v = at.get(table.ids[Math.floor(s.sp![k]! / 2)]!);
        if (v !== undefined) { idx.push(v * 2 + (s.sp![k]! % 2)); val.push(s.sp![k + 1]!); }
      }
      if ((logitOfParts(model, s.x, idx, val) > 0 ? 1 : 0) === s.y) ok += 1;
    }
    return ok / samples.length;
  };
  const opts = { featureSet: "v2", hidden: 8, epochs: 20, batch: 64, lr: 0.01, l2: 1e-4, seed: 1, minCardCount: 1 } as const;

  it("a linear v2 fit learns a label that only the card bag carries (#value-model)", () => {
    const { samples, table } = bagCorpus();
    const model = fitBatched(samples, table, { ...opts, model: "linear", lr: 0.05, epochs: 40 });
    expect(accuracy(samples, table, model)).toBeGreaterThan(0.95);
  });

  it("an mlp v2 fit learns a label that only the card bag carries, through the same inference the bot runs (#value-model)", () => {
    const { samples, table } = bagCorpus();
    const model = fitBatched(samples, table, { ...opts, model: "mlp" });
    expect(model.kind).toBe("mlp");
    expect(accuracy(samples, table, model)).toBeGreaterThan(0.95);
  });

  it("the card vocabulary keeps cards that appear in at least the minimum number of positions, most frequent first (#value-model)", () => {
    const table = CardTable.from(["A", "B", "C"]);
    const row = (sp: number[]): Sample => ({ x: [], y: 1, hand: 0, turn: 1, game: 0, sp });
    // Slot keys are 2 * card + slot: A (card 0) in 2 positions, B (card 1) in 3 (once with both slots), C (card 2) in 1.
    const samples = [row([0, 1]), row([2, 1]), row([3, 1, 2, 1]), row([2, 1, 0, 1]), row([4, 1])];
    expect(buildVocab(samples, table, 2)).toEqual(["B", "A"]);
    expect(buildVocab(samples, table, 3)).toEqual(["B"]);
  });

  it("a fit without the card bag has an empty vocabulary even when cards would pass the minimum count (#1095)", () => {
    const { samples, table } = bagCorpus();
    expect(fitBatched(samples, table, { ...opts, model: "mlp", epochs: 1 }).vocab).toEqual(["A", "B"]);
    const model = fitBatched(samples, table, { ...opts, model: "mlp", epochs: 1, bag: false });
    expect(model.vocab).toEqual([]);
    expect(model.kind === "mlp" && model.hidden.W1[0]!.length).toBe(FEATURE_NAMES_V2.length);
  });
});

describe("fitValue command line", () => {
  it("--no-bag turns the card bag off and needs feature set v2 (#1095)", () => {
    expect(fitFlags(["--features", "v2", "--model", "mlp"], null).noBag).toBe(false);
    expect(fitFlags(["--features", "v2", "--model", "mlp", "--no-bag"], null).noBag).toBe(true);
    expect(() => fitFlags(["--no-bag"], null)).toThrow(/v2/);
  });

  it("--like-compare reproduces the committed model's kind and hyperparameters, and a flag still overrides them (#1095)", () => {
    const like = fitFlags(["--like-compare"], VALUE_WEIGHTS);
    expect(like).toMatchObject({ featureSet: "v2", kind: "mlp", noBag: true, hidden: 32, epochs: 20, batch: 512, l2: 0.003, seed: 1 });
    expect(fitFlags(["--like-compare", "--l2", "0.1", "--hidden", "8"], VALUE_WEIGHTS)).toMatchObject({ l2: 0.1, hidden: 8, kind: "mlp" });
    // Without a fit record a model is the plain linear v1 fit.
    const old: ValueWeights = { names: [...FEATURE_NAMES], weights: FEATURE_NAMES.map(() => 0), bias: 0 };
    expect(fitFlags([], old)).toMatchObject({ featureSet: "v1", kind: "linear", noBag: false, l2: 0.01 });
  });
});

describe("BotOptions.valueWeights", () => {
  /** The same positions the other value-model tests use: a normal-vs-normal game on two meta decks. */
  function positions(seed: number, every: number): { state: MatchState; seat: Seat }[] {
    const game = playBotGame({ seed, players: [META[seed % META.length]!, META[(seed * 5 + 3) % META.length]!], levels: ["normal", "normal"] });
    const out: { state: MatchState; seat: Seat }[] = [];
    let n = 0;
    replayMatch(game.replay, (step) => {
      n += 1;
      if (n % every === 0 && step.state.winner === null && step.state.phase !== "mulligan") out.push({ state: step.state, seat: actingSeat(step.state) });
    });
    return out;
  }
  /** Every non-terminal position scores exactly this log odds under the constant model. */
  const CONSTANT = 3;
  const constant: ValueWeights = { names: [...FEATURE_NAMES], weights: new Array<number>(FEATURE_NAMES.length).fill(0), bias: CONSTANT };

  function search(evalMode: "learned" | "hand") {
    for (const { state, seat } of positions(14, 7)) {
      const view = getPlayerView(state, seat);
      const rng = createSeededRng(3);
      const base = peekNormalIntent(view, rng);
      if (!base) continue;
      const candidates = candidatesFor(view, base, rng);
      const result = searchCandidates(state, seat, view, base, candidates, rng, { level: "hard", budgetMs: Infinity, samples: 1, maxEvals: 12, evalMode, valueWeights: constant });
      if (result) return result;
    }
    throw new Error("no position with two or more candidates");
  }

  it("scores rollout end positions with the given model in learned mode (#value-model)", () => {
    const { scores } = search("learned");
    const flat = scores.flat().filter((s): s is number => s !== null);
    expect(flat.length).toBeGreaterThan(1);
    // Rollouts that end the game score +-14 and more; every other end position scores the model's constant.
    const open = flat.filter((s) => Math.abs(s) < 10);
    expect(open.length).toBeGreaterThan(0);
    for (const s of open) expect(s).toBe(CONSTANT);
  });

  it("reports win probabilities from the given model in hand mode too (#value-model)", () => {
    const { probs } = search("hand");
    const flat = probs.flat().filter((p): p is number => p !== null);
    const open = flat.filter((p) => p > 0 && p < 1);
    expect(open.length).toBeGreaterThan(0);
    for (const p of open) expect(p).toBeCloseTo(sigmoid(CONSTANT), 10);
  });
});
