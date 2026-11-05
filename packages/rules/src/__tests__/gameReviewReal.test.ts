import { describe, expect, it } from "vitest";
import { getPlayerView } from "../engine.js";
import { rankOptions } from "../bot/analysis.js";
import { createSeededRng } from "../rng.js";
import { replayApply, replayStart } from "../matchReplay.js";
import { stableJson } from "../review/classify.js";
import { MOVE_CLASSES, reviewGame } from "../gameReview.js";
import { MATCH_REPLAY_SCHEMA, type MatchReplay } from "../matchReplay.js";
import { expandDeck, loadFixture } from "../testing/replay.js";

describe("game review on a real recording (#967)", () => {
  it("reviews the opening of a recorded game with the real bot analysis (#967)", () => {
    const f = loadFixture("purple-red-full-game");
    const replay: MatchReplay = {
      schema: MATCH_REPLAY_SCHEMA, rulesVersion: "test", registryHash: "test", seed: f.seed, firstSeat: f.firstSeat,
      skipMulligans: true, lifeCheckEveryHit: true, privateChoicesV2: true,
      players: [{ leaderId: f.players[0].leaderId, deck: expandDeck(f.players[0].deck) }, { leaderId: f.players[1].leaderId, deck: expandDeck(f.players[1].deck) }],
      intents: f.intents.slice(0, 24),
    };
    const review = reviewGame(replay, { budgetMs: 30, samples: 2 });
    expect(review.diverged).toBeUndefined();
    expect(review.moves.length).toBeGreaterThan(3);
    expect(review.moves.length + review.forced).toBe(replay.intents.length);
    for (const m of review.moves) {
      expect(m.options).toBeGreaterThanOrEqual(1);
      expect(m.bestWin).toBeGreaterThanOrEqual(0);
      expect(m.bestWin).toBeLessThanOrEqual(100);
      if (m.cls) {
        expect(MOVE_CLASSES).toContain(m.cls);
        expect(m.loss).toBeGreaterThanOrEqual(0);
        expect(m.playedWin! + m.loss!).toBeCloseTo(m.bestWin, 6);
      }
    }
    const graded = review.seats[0].graded + review.seats[1].graded;
    expect(graded).toBeGreaterThan(0);
    for (const s of review.seats) if (s.accuracy !== null) expect(s.accuracy).toBeGreaterThan(0), expect(s.accuracy).toBeLessThanOrEqual(100);
    expect(review.evals[0]!.win[0] + review.evals[0]!.win[1]).toBeGreaterThan(0);
  });

  it("rankOptions scores a legal intent the bot would not consider when asked to include it (#967)", () => {
    const f = loadFixture("purple-red-full-game");
    const replay: MatchReplay = {
      schema: MATCH_REPLAY_SCHEMA, rulesVersion: "test", registryHash: "test", seed: f.seed, firstSeat: f.firstSeat,
      skipMulligans: true, lifeCheckEveryHit: true, privateChoicesV2: true,
      players: [{ leaderId: f.players[0].leaderId, deck: expandDeck(f.players[0].deck) }, { leaderId: f.players[1].leaderId, deck: expandDeck(f.players[1].deck) }],
      intents: f.intents.slice(0, 40),
    };
    let state = replayStart(replay);
    let checked = 0;
    for (let i = 0; i < replay.intents.length && checked < 3; i++) {
      const { seat, intent } = replay.intents[i]!;
      const rng = () => createSeededRng(7 + i);
      const base = rankOptions(state, seat, { budgetMs: 30, samples: 2, rng: rng() });
      if (getPlayerView(state, seat).legalIntents.length > 1 && !base.some((o) => stableJson(o.intent) === stableJson(intent))) {
        const withIt = rankOptions(state, seat, { budgetMs: 30, samples: 2, rng: rng(), include: [intent] });
        const got = withIt.find((o) => stableJson(o.intent) === stableJson(intent));
        expect(got, `step ${i} ${intent.type}`).toBeDefined();
        expect(got!.samples).toBeGreaterThan(0);
        expect(withIt.length).toBe(base.length + 1);
        // An intent the bot already considers is not added twice.
        expect(rankOptions(state, seat, { budgetMs: 30, samples: 2, rng: rng(), include: [base[0]!.intent] })).toHaveLength(base.length);
        checked++;
      }
      state = replayApply(state, replay, i).state;
    }
    expect(checked).toBeGreaterThan(0);
  });
});
