import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { FEATURE_NAMES, type FeatureName } from "../bot/features.js";
import { buildSimDataset } from "../sim/fitValue.js";
import { opponentDecksFromSimGames, parseSimGame, samplesFromSimGame, type SimGame, type SimMatchRecord } from "../sim/optcgsim/index.js";

const fixture = (name: string): SimMatchRecord =>
  JSON.parse(readFileSync(new URL(`../sim/optcgsim/__fixtures__/${name}`, import.meta.url), "utf8")) as SimMatchRecord;

const WON = fixture("game-me-first-won.json"); // me first, me won, 10 turns
const LOST = fixture("game-me-second-lost.json"); // me second, me lost, 9 turns

const f = (x: number[], name: FeatureName): number => x[FEATURE_NAMES.indexOf(name)]!;
const clone = (g: SimGame): SimGame => structuredClone(g);

describe("OPTCGSim games as value-model samples (#1030)", () => {
  it("one sample per turn with a full-length feature vector and the label 'the recording player won' (#1030)", () => {
    const won = samplesFromSimGame(parseSimGame(WON), 7);
    expect(won).toHaveLength(parseSimGame(WON).turns.length);
    for (const s of won) {
      expect(s.x).toHaveLength(FEATURE_NAMES.length);
      expect(s.y).toBe(1);
      expect(s.game).toBe(7);
      expect(s.x.every(Number.isFinite)).toBe(true);
    }
    expect(won.map((s) => s.turn)).toEqual(parseSimGame(WON).turns.map((t) => t.number));
    const lost = samplesFromSimGame(parseSimGame(LOST), 8);
    expect(lost.length).toBeGreaterThan(0);
    expect(lost.every((s) => s.y === 0)).toBe(true);
  });

  it("features are the recording player's view: own life, hand and board against the opponent's (#1030)", () => {
    const g = parseSimGame(WON);
    const t = g.turns[7]!; // turn 8, the opponent's: me has life 4 / 3 cards in hand, opp life 2 / 7 cards
    expect(t.snapshot.me.lifeCount).not.toBe(t.snapshot.opp.lifeCount);
    expect(t.snapshot.me.handCount).not.toBe(t.snapshot.opp.handCount);
    const x = samplesFromSimGame(g, 0)[7]!.x;
    expect(f(x, "life_me")).toBeCloseTo(t.snapshot.me.lifeCount / 5);
    expect(f(x, "life_opp")).toBeCloseTo(t.snapshot.opp.lifeCount / 5);
    expect(f(x, "hand_me")).toBeCloseTo(t.snapshot.me.handCount / 7);
    // The opponent's hand is only a count, and the count is used.
    expect(f(x, "hand_opp")).toBeCloseTo(t.snapshot.opp.handCount / 7);
    expect(f(x, "chars_me")).toBeCloseTo(t.snapshot.me.characters.length / 5);
    expect(f(x, "chars_opp")).toBeCloseTo(t.snapshot.opp.characters.length / 5);
  });

  it("rested characters, attached and spent DON!! are reflected in the features (#1030)", () => {
    const g = parseSimGame(WON);
    const t = g.turns[7]!.snapshot.me; // leader rested with 2 attached, one rested Character, 5 rested DON!!, nothing active
    expect(t.leader.attachedDon).toBe(2);
    expect(t.characters.filter((c) => c.rested)).toHaveLength(1);
    const x = samplesFromSimGame(g, 0)[7]!.x;
    expect(f(x, "rested_me")).toBeCloseTo(1 / 5);
    expect(f(x, "don_attached_me")).toBeCloseTo(2 / 10);
    expect(f(x, "don_me")).toBeCloseTo((t.donActive + t.donRested + 2) / 10);
    expect(f(x, "don_active_me")).toBeCloseTo(0);
  });

  it("DON!! attached to a Character counts, and so does its power change (#1030)", () => {
    const base = parseSimGame(WON);
    const plain = samplesFromSimGame(base, 0)[7]!.x;
    const g = clone(base);
    g.turns[7]!.snapshot.me.characters[0]!.attachedDon = 3;
    g.turns[7]!.snapshot.me.characters[0]!.powerDelta = 2000;
    const x = samplesFromSimGame(g, 0)[7]!.x;
    expect(f(x, "don_attached_me") - f(plain, "don_attached_me")).toBeCloseTo(3 / 10);
    // The opponent is the active player in turn 8, so attached DON!! adds no power: only the +2000 shows.
    expect(f(x, "char_power_me") - f(plain, "char_power_me")).toBeCloseTo(2000 / 30000);
  });

  it("each side's started turns count: the first player has started one more turn on their own turn (#1030)", () => {
    const x = samplesFromSimGame(parseSimGame(WON), 0)[6]!.x; // turn 7: me 4 turns started, opponent 3
    expect(f(x, "turns_started_diff")).toBe(1);
    expect(f(x, "my_turn")).toBe(1);
    expect(f(x, "turn")).toBeCloseTo(0.7);
  });

  it("a game with an unknown card id or without a winner yields no samples (#1030)", () => {
    const g = clone(parseSimGame(WON));
    g.turns[3]!.snapshot.opp.characters[0] = { slot: 0, id: "P-159", rested: false, powerDelta: 0, attachedDon: 0 };
    expect(samplesFromSimGame(g, 0)).toEqual([]);
    const noWinner = clone(parseSimGame(WON));
    noWinner.winner = null;
    expect(samplesFromSimGame(noWinner, 0)).toEqual([]);
  });
});

describe("OPTCGSim sim datasets and deck prior (#1030)", () => {
  it("sim games are held out by game and numbered after the replay games (#1030)", () => {
    const records = [WON, LOST, WON, LOST, WON, LOST];
    const { train, test, games } = buildSimDataset([records], { holdout: 0.2, firstGame: 100 });
    expect(games).toBe(6);
    // stride 5: game index 4 (game number 104) is held out entire, every other game trains.
    expect([...new Set(test.map((s) => s.game))]).toEqual([104]);
    expect(test).toHaveLength(parseSimGame(WON).turns.length);
    expect([...new Set(train.map((s) => s.game))].sort()).toEqual([100, 101, 102, 103, 105]);
  });

  it("opponent decks are the other side's 50-card list; short lists are dropped (#1030)", () => {
    const won = parseSimGame(WON);
    const [d] = opponentDecksFromSimGames([won]);
    expect(d!.leaderId).toBe(won.opp.leaderId);
    expect(d!.deck).toHaveLength(50);
    expect(d!.deck.filter((id) => id === won.opp.decklist[0]!.id)).toHaveLength(won.opp.decklist[0]!.count);
    expect(d!.deck.join()).not.toBe(won.me.decklist.flatMap((c) => new Array<string>(c.count).fill(c.id)).join());
    const short = clone(won);
    short.opp.decklist = short.opp.decklist.slice(1);
    expect(opponentDecksFromSimGames([short])).toEqual([]);
  });
});
