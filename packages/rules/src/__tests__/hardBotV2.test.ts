import { describe, expect, it } from "vitest";
import {
  actingSeat, botTurnMemory, buildDeckPrior, chooseBotIntent, chooseBotIntentFromState, determinize, describeIntent, extractFeatures, FEATURE_NAMES,
  noteBotPick, rankOptions, seedBotTurnMemory, winProbability, type DeckPrior,
} from "../bot/index.js";
import { getCardDef } from "../cards/definitions.js";
import { priorFromFile, priorToFile } from "../bot/defaultPrior.js";
import { goldfishScore, chooseSimMulligan } from "../bot/mulligan.js";
import { weightsMatchFeatures } from "../bot/valueModel.js";
import { createMatch, getPlayerView } from "../engine.js";
import { evaluateLearned } from "../bot/index.js";
import { replayMatch } from "../matchReplay.js";
import { createSeededRng } from "../rng.js";
import { fitLogistic, samplesFromReplay, type Sample } from "../sim/fitValue.js";
import { playBotGame } from "../sim/selfPlay.js";
import { FILLER, Harness } from "../testing/harness.js";
import type { Intent, MatchState, Seat } from "../types.js";
import metaDecks from "./fixtures/meta-decks.json";

const META = metaDecks as { name: string; leaderId: string; deck: string[] }[];
const L = "OP01-001";
const rng = (seed = 7) => createSeededRng(seed);
const exact = { level: "hard", budgetMs: Infinity, samples: 2, maxEvals: 10 } as const;

/** Positions (state + the seat to move) from a normal-vs-normal game on two meta decks. */
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

const multiset = (ids: readonly string[]): string => JSON.stringify(Object.entries(ids.reduce<Record<string, number>>((m, id) => ({ ...m, [id]: (m[id] ?? 0) + 1 }), {})).sort(([a], [b]) => a.localeCompare(b)));

/** Cards of `seat` the other seat can see (board, Stage, trash, face-up Life, revealed hand), as def ids. */
function seenOf(state: MatchState, seat: Seat): string[] {
  const p = state.players[seat];
  const revealed = new Set(p.revealedHandIds ?? []);
  return [
    ...p.characters.map((c) => c.defId), ...(p.stage ? [p.stage.defId] : []), ...p.resolving.map((c) => c.defId), ...p.trash,
    ...p.life.filter((_, i) => p.faceUpLife[i]), ...p.hand.filter((c) => revealed.has(c.id)).map((c) => c.defId),
  ];
}
/** Opponent cards hidden from the other seat (hand, deck, face-down Life) as def ids. */
function hiddenOf(state: MatchState, seat: Seat): string[] {
  const p = state.players[seat];
  const revealed = new Set(p.revealedHandIds ?? []);
  return [...p.hand.filter((c) => !revealed.has(c.id)).map((c) => c.defId), ...p.deck, ...p.life.filter((_, i) => !p.faceUpLife[i])];
}

describe("learned value model (#635)", () => {
  it("the feature list and the committed weights line up, and every feature is finite on real positions (#635)", () => {
    expect(weightsMatchFeatures()).toBe(true);
    for (const { state, seat } of positions(11, 12)) {
      const x = extractFeatures(state, seat);
      expect(x).toHaveLength(FEATURE_NAMES.length);
      expect(x.every(Number.isFinite)).toBe(true);
    }
  }, 60_000);

  it("features never read the opponent's hand contents, only its size (#635)", () => {
    let compared = 0;
    for (const { state, seat } of positions(12, 10)) {
      const opp: Seat = seat === 0 ? 1 : 0;
      const other = structuredClone(state);
      for (const c of other.players[opp].hand) c.defId = "OP01-006"; // a Counter-bearing Character
      expect(extractFeatures(other, seat)).toEqual(extractFeatures(state, seat));
      compared += 1;
    }
    expect(compared).toBeGreaterThan(5);
  }, 60_000);

  it("winProbability is exact once the game is over and moves the right way with Life (#635)", () => {
    const h = new Harness({ leaders: [L, L] });
    const even = winProbability(h.state, 0);
    expect(even).toBeGreaterThan(0.02);
    expect(even).toBeLessThan(0.98);
    h.state.players[1].life.splice(0, 3);
    h.state.players[1].faceUpLife.splice(0, 3);
    h.state.players[1].zoneInstanceIds.life.splice(0, 3);
    expect(winProbability(h.state, 0)).toBeGreaterThan(even);
    expect(winProbability({ ...h.state, winner: 1 }, 0)).toBe(0);
    expect(winProbability({ ...h.state, winner: 0 }, 0)).toBe(1);
  });

  it("fitLogistic learns which feature decides the label and drops the noise (#635)", () => {
    const r = createSeededRng(5);
    const samples: Sample[] = Array.from({ length: 600 }, (_, i) => {
      const x = FEATURE_NAMES.map(() => (r.nextInt(2000) - 1000) / 1000);
      return { x, y: x[2]! + 0.1 * x[9]! > 0 ? 1 : 0, hand: 0, turn: 1, game: i };
    });
    const w = fitLogistic(samples, { l2: 0.001, iters: 400 });
    expect(w.weights[2]!).toBeGreaterThan(1);
    expect(Math.abs(w.weights[20]!)).toBeLessThan(w.weights[2]! / 4);
  });

  it("samplesFromReplay labels every position with whether that seat won (#635)", () => {
    const game = playBotGame({ seed: 21, players: [META[0]!, META[1]!], levels: ["normal", "normal"] });
    expect(game.winner).not.toBeNull();
    const rows = samplesFromReplay(game.replay, 0);
    expect(rows.length).toBeGreaterThan(6);
    // Positions come in pairs: seat 0's view, then seat 1's. Exactly one of the two won.
    for (let i = 0; i < rows.length; i += 2) {
      expect(rows[i]!.y + rows[i + 1]!.y).toBe(1);
      expect(rows[i]!.y).toBe(game.winner === 0 ? 1 : 0);
    }
  }, 60_000);
});

describe("hard bot: opponent list modeling (#635)", () => {
  /** A position where the opponent has hidden cards and some it has shown, plus the prior list that matches its real deck. */
  function scenario(seed: number): { state: MatchState; seat: Seat; opp: Seat } {
    const found = positions(seed, 8).find((p) => seenOf(p.state, p.seat === 0 ? 1 : 0).length > 4 && hiddenOf(p.state, p.seat === 0 ? 1 : 0).length > 15);
    if (!found) throw new Error("no position");
    return { ...found, opp: found.seat === 0 ? 1 : 0 };
  }

  it("deals the opponent's hidden cards from the tournament list minus what was seen, not from its real deck (#635)", () => {
    for (const seed of [31, 32]) {
      const { state, seat, opp } = scenario(seed);
      const hidden = hiddenOf(state, opp);
      const seen = seenOf(state, opp);
      // The list the bot believes in: the same seen cards, but 6 of the hidden ones are other cards the real deck does not hold.
      const swapped = [...hidden];
      const stand = ["OP01-006", "OP01-007", "OP01-008", "OP01-009", "OP01-016", "OP01-025"];
      stand.forEach((id, i) => { swapped[i] = id; });
      const prior: DeckPrior = { lists: { [state.players[opp].leader.defId]: [[...seen, ...swapped]] } };
      for (let k = 1; k <= 3; k += 1) {
        const d = determinize(state, seat, rng(k), prior);
        expect(multiset(hiddenOf(d, opp))).toBe(multiset(swapped));
        expect(multiset(seenOf(d, opp))).toBe(multiset(seen));
      }
      // With the legacy "true" prior the real hidden multiset is kept.
      expect(multiset(hiddenOf(determinize(state, seat, rng(1), "true"), opp))).toBe(multiset(hidden));
    }
  }, 60_000);

  it("when the list is short of cards, the rest of the hidden zones is dealt from cards that share the leader's color instead of from the real deck (#635)", () => {
    const { state, seat, opp } = scenario(33);
    const leader = state.players[opp].leader.defId;
    const colors = getCardDef(leader).colors;
    const hidden = hiddenOf(state, opp);
    // A list that only knows 12 of the hidden cards (and what was seen).
    const prior: DeckPrior = { lists: { [leader]: [[...seenOf(state, opp), ...hidden.slice(0, 12)]], "OP99-999": META.map((m) => m.deck) } };
    const d = determinize(state, seat, rng(2), prior);
    const dealt = hiddenOf(d, opp);
    expect(dealt).toHaveLength(hidden.length);
    for (const id of hidden.slice(0, 12)) expect(dealt).toContain(id);
    for (const id of dealt) expect(getCardDef(id).colors.some((c) => colors.includes(c)), `${id} shares no color with ${leader}`).toBe(true);
    expect(multiset(dealt)).not.toBe(multiset(hidden));
  }, 60_000);

  it("Hard's lookahead depends on the list it assumes, not on which cards the opponent really holds (#635)", () => {
    let compared = 0;
    for (const { state, seat } of positions(37, 9).slice(0, 10)) {
      const opp: Seat = seat === 0 ? 1 : 0;
      const other = structuredClone(state);
      // Change what the opponent really holds (the multiset, not just the order): the seat cannot see it either way.
      other.players[opp].deck = other.players[opp].deck.map(() => "OP01-006");
      const a: (number | null)[][] = [];
      const b: (number | null)[][] = [];
      chooseBotIntentFromState(state, seat, { ...exact, rng: rng(), onTrace: (t) => a.push(...t.scores) });
      chooseBotIntentFromState(other, seat, { ...exact, rng: rng(), onTrace: (t) => b.push(...t.scores) });
      expect(b).toEqual(a);
      if (a.length) compared += 1;
    }
    expect(compared).toBeGreaterThan(2);
  }, 120_000);

  it("with no list for the leader the hidden cards are drawn from the prior's cards that share the leader's color (#635)", () => {
    let checked = 0;
    for (const seed of [34, 35, 36]) {
      const { state, seat, opp } = scenario(seed);
      const leader = state.players[opp].leader.defId;
      const colors = getCardDef(leader).colors;
      // A prior that knows other leaders only.
      const prior = buildDeckPrior(META.filter((m) => m.leaderId !== leader));
      const d = determinize(state, seat, rng(seed), prior);
      const hidden = hiddenOf(d, opp);
      expect(hidden).toHaveLength(hiddenOf(state, opp).length);
      for (const id of hidden) {
        const def = getCardDef(id);
        expect(def.colors.some((c) => colors.includes(c)), `${id} shares no color with ${leader}`).toBe(true);
      }
      checked += 1;
    }
    expect(checked).toBe(3);
  }, 60_000);

  it("a prior survives the compact file format it ships in (#635)", () => {
    const back = priorFromFile(priorToFile(META));
    expect(back.lists[META[2]!.leaderId]![0]!.slice().sort()).toEqual([...META[2]!.deck].sort());
  });
});

describe("bot: total cost / power limits on selections (#635)", () => {
  /** OP09-018 [Main]: K.O. up to 2 of the opponent's Characters with a total power of 4000 or less. */
  function koScenario(): Harness {
    const h = new Harness({ leaders: [L, L] });
    h.don(0, 3);
    h.hand(0, "OP09-018");
    h.field(1, FILLER, FILLER, "OP01-009"); // three 3000-power Characters
    h.play(0, "OP09-018");
    return h;
  }

  it("the engine tells the chooser the total power limit of a 'total power of 4000 or less' selection (#635)", () => {
    const h = koScenario();
    expect(h.choice?.request).toMatchObject({ type: "select", max: 2, totalPowerAtMost: 4000 });
  });

  it("normal answers a 'K.O. up to 2 with total power 4000 or less' prompt with a pick the engine accepts (#635)", () => {
    const h = koScenario();
    for (const level of ["easy", "normal"] as const) {
      const answer = chooseBotIntent(getPlayerView(h.state, 0), { level, rng: rng() }) as Extract<Intent, { type: "resolve_pending_choice" }>;
      const r = h.try(0, answer);
      expect(r.ok, r.error?.message).toBe(true);
      expect(answer.selectedOptionIds?.length ?? 0).toBeLessThanOrEqual(1);
    }
  });

  it("normal bots lose no answer to the engine's total cost / power limits in a seeded batch (#635)", () => {
    let rejected = 0;
    // Seeds where, before the limit was read from the request, a bot answer to a total cost / power prompt was rejected.
    for (const seed of [8100, 8107, 8112, 8113, 8114, 8116]) {
      rejected += playBotGame({ seed, players: [META[seed % META.length]!, META[(seed * 3 + 1) % META.length]!], levels: ["normal", "normal"] }).fallbacks;
    }
    expect(rejected).toBe(0);
  }, 120_000);
});

describe("hard bot: mulligan by simulation (#635)", () => {
  const costs = (...c: number[]) => c.map((n) => (n === 1 ? "OP01-006" : n === 2 ? "OP01-009" : "OP01-008"));

  it("a hand that spends its DON!! every turn scores higher than a hand of expensive cards (#635)", () => {
    const draws = Array.from({ length: 6 }, () => "EB04-003"); // cost 8: nothing drawn can be cast either
    expect(goldfishScore(costs(1, 2, 2, 4, 4), draws, false)).toBeGreaterThan(goldfishScore(Array.from({ length: 5 }, () => "EB04-003"), draws, false));
  });

  function mulliganView(hand: string[]) {
    const legal: Intent[] = [{ type: "mulligan", doMulligan: false }, { type: "mulligan", doMulligan: true }];
    return { legalIntents: legal, you: { hand: hand.map((defId) => ({ defId })) } } as unknown as ReturnType<typeof getPlayerView>;
  }
  function mulliganState(deck: string[]): MatchState {
    const empty = { deck, life: [] as string[] };
    return { firstSeat: 0, players: [empty, empty] } as unknown as MatchState;
  }

  it("keeps a hand with a curve and mulligans a hand it cannot cast out of a deck of cheap cards (#635)", () => {
    const cheap = Array.from({ length: 40 }, (_, i) => (i % 2 ? "OP01-009" : "OP01-006"));
    const state = mulliganState(cheap);
    const dead = Array.from({ length: 5 }, () => "EB04-003"); // cost 8
    const good = ["OP01-006", "OP01-009", "OP01-009", "OP01-007", "OP01-007"];
    const base = { type: "mulligan", doMulligan: false } as Intent;
    expect(chooseSimMulligan(state, 0, mulliganView(dead), rng(), base)).toEqual({ type: "mulligan", doMulligan: true });
    expect(chooseSimMulligan(state, 0, mulliganView(good), rng(), base)).toEqual({ type: "mulligan", doMulligan: false });
  });
});

describe("hard bot: opponent model and lookahead (#635)", () => {
  it("scores every candidate when the opponent plays greedily and the lookahead spans its next turn, and the greedy opponent changes some scores (#635)", () => {
    let differs = 0;
    let deeper = 0;
    let searched = 0;
    for (const { state, seat } of positions(41, 14).slice(0, 8)) {
      const traces: { normal?: (number | null)[][]; greedy?: (number | null)[][] } = {};
      chooseBotIntentFromState(state, seat, { ...exact, horizonTurns: 2, opponentModel: "normal", rng: rng(), onTrace: (t) => { traces.normal = t.scores; } });
      chooseBotIntentFromState(state, seat, { ...exact, horizonTurns: 2, opponentModel: "greedy", rng: rng(), onTrace: (t) => { traces.greedy = t.scores; } });
      if (!traces.greedy || !traces.normal) continue;
      searched += 1;
      const oneTurn: (number | null)[][] = [];
      chooseBotIntentFromState(state, seat, { ...exact, horizonTurns: 1, opponentModel: "normal", rng: rng(), onTrace: (t) => oneTurn.push(...t.scores) });
      if (JSON.stringify(oneTurn) !== JSON.stringify(traces.normal)) deeper += 1;
      expect(traces.greedy[0]![0]).not.toBeNull();
      if (JSON.stringify(traces.greedy) !== JSON.stringify(traces.normal)) differs += 1;
    }
    expect(searched).toBeGreaterThan(2);
    expect(differs).toBeGreaterThan(0);
    expect(deeper, "looking through the opponent's turn scores positions differently from stopping at the end of mine").toBeGreaterThan(0);
  }, 120_000);

  it("a search run in another thread continues the bot's turn record: used abilities are carried over and picks are noted (#635)", () => {
    const { state, seat } = positions(42, 9).find((p) => p.state.phase === "main" && p.state.pendingChoices.length === 0)!;
    const a = rng(3);
    const pick: Intent = { type: "activate_ability", sourceId: state.players[seat].leader.id, abilityId: "x#0" };
    noteBotPick(state, seat, a, pick);
    const snap = botTurnMemory(state, seat, a);
    expect(snap.count).toBe(1);
    expect(snap.activated).toContain(`${pick.sourceId}:x#0`);
    const b = rng(4);
    seedBotTurnMemory(state, seat, b, snap);
    expect(botTurnMemory(state, seat, b)).toEqual(snap);
  }, 60_000);
});

describe("position analysis (#635)", () => {
  it("rankOptions lists every candidate with a label, a win chance and exactly one bot pick, best first (#635)", () => {
    const h = new Harness({ leaders: [L, L] });
    h.don(0, 3);
    h.hand(0, "OP01-009", "OP01-025", FILLER);
    const ranked = rankOptions(h.state, 0, { budgetMs: Infinity, samples: 2, search: { maxEvals: 60 } });
    expect(ranked.length).toBeGreaterThan(2);
    expect(ranked.filter((o) => o.isBotPick)).toHaveLength(1);
    for (const o of ranked) {
      expect(o.winChance).toBeGreaterThanOrEqual(0);
      expect(o.winChance).toBeLessThanOrEqual(1);
      expect(o.samples).toBeGreaterThan(0);
      expect(o.label.length).toBeGreaterThan(3);
    }
    expect([...ranked].sort((a, b) => b.winChance - a.winChance)).toEqual(ranked);
    expect(ranked.map((o) => o.label)).toContain("Play Roronoa Zoro (OP01-025)");
    expect(ranked.map((o) => o.label)).toContain("End turn");
  });

  it("rankOptions puts the lethal attack first with a win chance of 1 (#635)", () => {
    const h = new Harness({ leaders: ["OP02-001", L] });
    h.life(1);
    h.don(1, 2);
    h.attach(0, h.state.players[0].leader, 1);
    const ranked = rankOptions(h.state, 0, { budgetMs: Infinity, samples: 2, search: { maxEvals: 60 } });
    expect(ranked[0]!.winChance).toBe(1);
    expect(ranked.find((o) => /^Attack the Leader with your Leader/.test(o.label))!.winChance).toBe(1);
    expect(ranked.find((o) => o.label === "End turn")!.winChance).toBeLessThan(1);
  });

  it("describes intents in words a player would use (#635)", () => {
    const h = new Harness({ leaders: [L, L] });
    h.hand(0, "OP01-009", "OP01-016");
    const opp = h.field(1, "OP01-025")[0]!;
    expect(describeIntent(h.state, 0, { type: "play_card", handIndex: 1 })).toBe("Play Nami (OP01-016)");
    expect(describeIntent(h.state, 0, { type: "give_don", donId: "d", targetId: h.state.players[0].leader.id })).toBe("Give 1 DON!! to the Leader");
    expect(describeIntent(h.state, 0, { type: "declare_attack", attackerId: h.state.players[0].leader.id, target: { kind: "character", instanceId: opp.id } })).toContain("Attack Roronoa Zoro (OP01-025) with your Leader");
    expect(describeIntent(h.state, 0, { type: "end_turn" })).toBe("End turn");
  });
});

describe("hard bot: learned score and mulligan wiring (#635)", () => {
  it("the learned score is selectable: it scores the same candidates on its own scale, and a finished game outranks any estimate (#635)", () => {
    let compared = 0;
    let lo = Infinity;
    let hi = -Infinity;
    for (const { state, seat } of positions(43, 11).slice(0, 8)) {
      const hand: (number | null)[][] = [];
      const learned: (number | null)[][] = [];
      chooseBotIntentFromState(state, seat, { ...exact, evalMode: "hand", rng: rng(), onTrace: (t) => hand.push(...t.scores) });
      chooseBotIntentFromState(state, seat, { ...exact, evalMode: "learned", rng: rng(), onTrace: (t) => learned.push(...t.scores) });
      if (!hand.length || !learned.length) continue;
      compared += 1;
      expect(JSON.stringify(learned)).not.toBe(JSON.stringify(hand));
      for (const v of learned.flat()) if (v !== null) { lo = Math.min(lo, v); hi = Math.max(hi, v); }
      const ongoing = evaluateLearned(state, seat);
      expect(evaluateLearned({ ...state, winner: seat }, seat)).toBeGreaterThan(ongoing + 5);
      expect(evaluateLearned({ ...state, winner: seat === 0 ? 1 : 0 }, seat)).toBeLessThan(ongoing - 5);
    }
    expect(compared).toBeGreaterThan(2);
    expect(Number.isFinite(lo) && Number.isFinite(hi)).toBe(true);
  }, 120_000);

  it("Hard keeps a hand of cheap Events that Normal's rule would mulligan, because the redraw (a deck of 8-cost cards) is worse (#635)", () => {
    const events = "OP09-018"; // cost 3 Event: castable on turn 2, but no Characters for Normal's rule
    const heavy = Array.from({ length: 50 }, () => "EB04-003");
    const base = createMatch({ seed: 3, firstSeat: 0, players: [{ leaderId: L, deck: heavy }, { leaderId: L, deck: heavy }] });
    const state = structuredClone(base);
    state.players[0].hand.forEach((c) => { c.defId = events; });
    const normal = chooseBotIntentFromState(state, 0, { level: "normal", rng: rng() });
    const hard = chooseBotIntentFromState(state, 0, { ...exact, rng: rng() });
    expect(normal).toEqual({ type: "mulligan", doMulligan: true });
    expect(hard).toEqual({ type: "mulligan", doMulligan: false });
  });
});
