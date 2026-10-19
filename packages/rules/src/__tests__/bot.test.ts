import { describe, expect, it } from "vitest";
import { chooseBotIntent, type BotLevel } from "../bot/index.js";
import { applyIntent, createMatch, getPlayerView } from "../engine.js";
import { replayMatch } from "../matchReplay.js";
import { createSeededRng } from "../rng.js";
import { playBotGame, runSelfPlay } from "../sim/selfPlay.js";
import { randomDeck } from "../sim/fuzz.js";
import { buildTestDeck } from "../cards/definitions.js";
import { FILLER, Harness } from "../testing/harness.js";
import type { Intent } from "../types.js";

const KAROO = FILLER; // cost 1, 3000, Counter 1000
const BIG_COUNTER = "EB02-055"; // cost 4, 5000, Counter 2000
const WEAK_BLOCKER = "EB01-017"; // cost 2, 2000, Blocker
const STRONG_BLOCKER = "EB03-019"; // cost 6, 7000, Blocker
const L = "OP01-001"; // 5000, no Activate: Main
const STRONG_LEADER = "OP02-001"; // 6000
const KO_EVENT = "ST08-015"; // [Main] K.O. up to 1 of your opponent's Characters with a cost of 2 or less.

const decks = (seed: number) => { const r = createSeededRng(seed); return [randomDeck(r), randomDeck(r)] as const; };

/** Seat 0's Leader attacks seat 1's Leader, which is at `life` Life; returns the bot's (seat 1) move at the block step. */
function underAttack(life: number, setup: (h: Harness) => void) {
  const h = new Harness({ leaders: [L, L] });
  h.life(1, ...Array.from({ length: life }, () => FILLER));
  setup(h);
  h.attack(h.state.players[0].leader, "leader");
  return h;
}
const bot = (h: Harness, seat: 0 | 1, level: BotLevel = "normal") => chooseBotIntent(h.view(seat), { level, rng: createSeededRng(1) });

describe("bot legality and strength (#631)", () => {
  it("every bot move is accepted by the engine and every game finishes, at both levels (#631)", () => {
    for (const levels of [["normal", "normal"], ["easy", "easy"], ["normal", "easy"]] as [BotLevel, BotLevel][]) {
      for (let seed = 1; seed <= 6; seed += 1) {
        const [a, b] = decks(seed);
        const r = playBotGame({ seed, players: [a, b], levels });
        expect(`${levels} seed ${seed}: ${r.stoppedEarly ?? "finished"}`).toBe(`${levels} seed ${seed}: finished`);
        // A rejected bot move would have been replaced by the engine default and counted here.
        expect(r.fallbacks).toBe(0);
      }
    }
  }, 120_000);

  it("returns null when it is not the bot's move and a legal intent when it is (#631)", () => {
    const h = new Harness({ leaders: [L, L] });
    expect(bot(h, 1)).toBeNull();
    const move = bot(h, 0);
    expect(h.view(0).legalIntents).toContainEqual(move);
  });

  it("the same view and rng state always give the same intent (#631)", () => {
    const [a, b] = decks(3);
    const game = playBotGame({ seed: 3, players: [a, b], levels: ["normal", "normal"] });
    let checked = 0;
    replayMatch(game.replay, (step) => {
      for (const seat of [0, 1] as const) {
        const view = getPlayerView(step.state, seat);
        if (!view.legalIntents.length) continue;
        const first = chooseBotIntent(view, { level: "normal", rng: createSeededRng(9) });
        const again = chooseBotIntent(view, { level: "normal", rng: createSeededRng(9) });
        expect(again).toEqual(first);
        checked += 1;
      }
    });
    expect(checked).toBeGreaterThan(50);
  }, 60_000);

  it("normal beats easy in a seeded batch (#631)", () => {
    const s = runSelfPlay({ games: 16, seed: 500, levels: ["normal", "easy"] });
    expect(s.finished).toBe(16);
    expect(s.winsByLevel.normal ?? 0).toBeGreaterThanOrEqual(13);
  }, 120_000);

  it("keeps a hand with two cheap Characters and mulligans one without (#631)", () => {
    const deck = buildTestDeck(20);
    const state = createMatch({ seed: 4, firstSeat: 0, players: [{ leaderId: "ST01-001", deck }, { leaderId: "ST01-001", deck }] });
    const hand = (...ids: string[]) => { state.players[0].hand = ids.map((defId, i) => ({ id: `m${i}`, defId, rested: false, attachedDonIds: [] })); };
    hand(KAROO, KAROO, STRONG_BLOCKER, STRONG_BLOCKER, STRONG_BLOCKER);
    expect(chooseBotIntent(getPlayerView(state, 0), { level: "normal" })).toEqual({ type: "mulligan", doMulligan: false });
    hand(KAROO, STRONG_BLOCKER, STRONG_BLOCKER, STRONG_BLOCKER, STRONG_BLOCKER);
    expect(chooseBotIntent(getPlayerView(state, 0), { level: "normal" })).toEqual({ type: "mulligan", doMulligan: true });
  });
});

describe("bot defense (#631)", () => {
  it("spends the smallest Counter that saves its last Life (#631)", () => {
    const h = underAttack(1, (x) => x.hand(1, BIG_COUNTER, KAROO));
    h.act(1, { type: "pass_block" });
    expect(h.state.phase).toBe("counter");
    // Needs +1000 to beat the 5000 attack: Karoo (1000, hand index 1), not the 2000 card.
    expect(bot(h, 1)).toEqual({ type: "counter_from_hand", handIndex: 1 });
  });

  it("takes the hit at high Life and keeps its hand (#631)", () => {
    const h = underAttack(4, (x) => x.hand(1, BIG_COUNTER, KAROO));
    h.act(1, { type: "pass_block" });
    expect(bot(h, 1)).toEqual({ type: "pass_counter" });
  });

  it("passes the counter step when the attack cannot connect (#631)", () => {
    const h = underAttack(1, (x) => x.hand(1, BIG_COUNTER, KAROO, KAROO));
    h.act(1, { type: "pass_block" });
    h.act(1, { type: "counter_from_hand", handIndex: 0 });
    h.act(1, { type: "counter_from_hand", handIndex: 0 });
    expect(bot(h, 1)).toEqual({ type: "pass_counter" });
  });

  it("blocks with a Blocker, however weak, to stay off zero Life (#631)", () => {
    const h = underAttack(1, (x) => x.field(1, WEAK_BLOCKER));
    expect(bot(h, 1)).toEqual({ type: "declare_block", blockerId: h.state.players[1].characters[0]!.id });
  });

  it("does not sacrifice a weak Blocker for a hit at high Life (#631)", () => {
    const h = underAttack(4, (x) => x.field(1, WEAK_BLOCKER));
    expect(bot(h, 1)).toEqual({ type: "pass_block" });
  });

  it("blocks at high Life when the Blocker survives the attack (#631)", () => {
    const h = underAttack(4, (x) => x.field(1, WEAK_BLOCKER, STRONG_BLOCKER));
    expect(bot(h, 1)).toEqual({ type: "declare_block", blockerId: h.state.players[1].characters[1]!.id });
  });
});

describe("bot main phase (#631)", () => {
  it("attacks the opposing Leader when its power connects (#631)", () => {
    const h = new Harness({ leaders: [L, L] });
    h.don(0, 0);
    expect(bot(h, 0)).toEqual({ type: "declare_attack", attackerId: h.state.players[0].leader.id, target: { kind: "leader" } });
  });

  it("powers its Leader up with DON!! to reach a stronger Leader, then attacks (#631)", () => {
    const h = new Harness({ leaders: [L, STRONG_LEADER] }); // 5000 vs 6000
    h.don(0, 1);
    const give = bot(h, 0);
    expect(give).toMatchObject({ type: "give_don", targetId: h.state.players[0].leader.id });
    h.act(0, give!);
    expect(bot(h, 0)).toEqual({ type: "declare_attack", attackerId: h.state.players[0].leader.id, target: { kind: "leader" } });
  });

  it("ends its turn instead of attacking a Leader it cannot beat (#631)", () => {
    const h = new Harness({ leaders: [L, STRONG_LEADER] });
    h.don(0, 0);
    expect(bot(h, 0)).toEqual({ type: "end_turn" });
  });

  it("K.O.s a strong rested Character rather than hitting a high-Life Leader (#631)", () => {
    const h = new Harness({ leaders: [L, L] });
    const [big] = h.field(1, BIG_COUNTER);
    big!.rested = true;
    h.don(0, 0);
    expect(bot(h, 0)).toEqual({ type: "declare_attack", attackerId: h.state.players[0].leader.id, target: { kind: "character", instanceId: big!.id } });
  });

  it("plays the most expensive card that fits its DON!! (#631)", () => {
    const h = new Harness({ leaders: [L, L] });
    h.hand(0, KAROO, BIG_COUNTER, STRONG_BLOCKER);
    h.don(0, 5);
    expect(bot(h, 0)).toEqual({ type: "play_card", handIndex: 1 });
  });

  it("targets the opponent's strongest eligible Character with a K.O. effect (#631)", () => {
    const h = new Harness({ leaders: [L, L] });
    h.hand(0, KO_EVENT);
    h.field(1, KAROO, WEAK_BLOCKER);
    h.don(0, 3);
    h.play(0, KO_EVENT);
    const answer = bot(h, 0) as Extract<Intent, { type: "resolve_pending_choice" }>;
    const request = h.choice!.request!;
    if (request.type !== "select") throw new Error("expected a select");
    const blockerOption = request.options.find((o) => o.defId === WEAK_BLOCKER)!;
    expect(answer.selectedOptionIds).toEqual([blockerOption.id]);
    expect(applyIntent(h.state, answer, { seat: 0, rng: createSeededRng(1) }).ok).toBe(true);
  });
});

describe("self-play recorder (#631)", () => {
  it("a saved replay re-runs to the same winner and records how it ended (#631)", () => {
    for (const seed of [11, 12, 13]) {
      const [a, b] = decks(seed);
      const game = playBotGame({ seed, players: [a, b], levels: ["normal", "normal"] });
      expect(game.winner).not.toBeNull();
      const replayed = replayMatch(JSON.parse(JSON.stringify(game.replay)));
      expect(replayed.winner).toBe(game.winner);
      expect(game.replay.end).toEqual({ winner: game.winner, reason: replayed.winReason });
    }
  }, 60_000);
});
