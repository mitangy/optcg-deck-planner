import { describe, expect, it } from "vitest";
import { chacha20Block, keyWords } from "../chacha20.js";
import { buildTestDeck, DEFAULT_LEADER_ID } from "../cards/definitions.js";
import { applyIntent, createMatch, getPlayerView, getSpectatorView, listLegalIntents, skipMulligans } from "../engine.js";
import { createSeededRng } from "../rng.js";
import { MATCH_REPLAY_SCHEMA, replayMatch, type MatchReplay } from "../replay/matchReplay.js";
import { reseedMatch } from "../replay/reseed.js";
import { seatLog } from "../replay/seatLog.js";
import { deserializeMatch, IncompatibleSnapshotError, serializeMatch } from "../engine/snapshot.js";
import type { MatchState, Seat } from "../types.js";

const KEY = "5eed".repeat(16);
const OTHER_KEY = "c0de".repeat(16);
const players: MatchReplay["players"] = [
  { leaderId: DEFAULT_LEADER_ID, deck: buildTestDeck(20) },
  { leaderId: DEFAULT_LEADER_ID, deck: buildTestDeck(20) },
];
const start = (seed: number, rngKey?: string) => createMatch({ seed, firstSeat: 0, ...(rngKey ? { rngKey } : {}), players: [{ ...players[0], deck: [...players[0].deck] }, { ...players[1], deck: [...players[1].deck] }] });

describe("keyed ChaCha20 stream (#1350)", () => {
  it("block function matches the RFC 8439 section 2.3.2 test vector (#1350)", () => {
    const key = "000102030405060708090a0b0c0d0e0f101112131415161718191a1b1c1d1e1f";
    const block = chacha20Block(keyWords(key), 1, [0x09000000, 0x4a000000, 0]);
    expect(Array.from(block, (w) => (w >>> 0).toString(16).padStart(8, "0"))).toEqual([
      "e4e7f110", "15593bd1", "1fdd0f50", "c47120a3",
      "c7f4d1c7", "0368c033", "9aaa2204", "4e6cd4c3",
      "466482d2", "09aa9f07", "05d7c214", "a2028bd9",
      "d19c12b5", "b94e16de", "e883d0cb", "4e3c50a2",
    ]);
  });

  it("resumes from a snapshot at the stream position, across block boundaries (#1350)", () => {
    const oracle = [...chacha20Block(keyWords(KEY), 0, [0, 7, 0]), ...chacha20Block(keyWords(KEY), 1, [0, 7, 0]), ...chacha20Block(keyWords(KEY), 2, [0, 7, 0])].map((w) => (w >>> 0) / 4294967296);
    const rng = createSeededRng({ seed: 7, cursor: 0, key: KEY });
    expect(Array.from({ length: 40 }, () => rng.next())).toEqual(oracle.slice(0, 40));
    expect(createSeededRng({ seed: 7, cursor: 20, key: KEY }).next()).toBe(oracle[20]);
    expect(createSeededRng({ seed: 7, cursor: 40, key: KEY }).snapshot()).toEqual({ seed: 7, cursor: 40, key: KEY });
    for (let i = 0; i < 15; i++) rng.next();
    const resumed = createSeededRng(JSON.parse(JSON.stringify(rng.snapshot())));
    expect(resumed.snapshot().cursor).toBe(55);
    for (let i = 0; i < 40; i++) expect(resumed.next()).toBe(rng.next());
    const fromStart = createSeededRng({ seed: 7, cursor: 0, key: KEY });
    for (let i = 0; i < 95; i++) fromStart.next();
    expect(fromStart.snapshot()).toEqual(rng.snapshot());
  });

  it("draws values the seed alone cannot give and snapshots the key only when keyed (#1350)", () => {
    const keyless = createSeededRng(7);
    const keyed = createSeededRng({ seed: 7, cursor: 0, key: KEY });
    expect(keyless.snapshot()).toEqual({ seed: 7, cursor: 0 });
    expect(Array.from({ length: 8 }, () => keyed.next())).not.toEqual(Array.from({ length: 8 }, () => createSeededRng(7).next()));
    const a = createSeededRng({ seed: 7, cursor: 0, key: KEY }).next();
    expect(createSeededRng({ seed: 7, cursor: 0, key: OTHER_KEY }).next()).not.toBe(a);
    expect(createSeededRng({ seed: 8, cursor: 0, key: KEY }).next()).not.toBe(a);
  });

  it.each(["", "abc", "Z".repeat(64), "A".repeat(64), "a".repeat(63)])("rejects malformed key %j (#1350)", (key) => {
    expect(() => createSeededRng({ seed: 1, cursor: 0, key })).toThrow(/Invalid RNG snapshot/);
  });
});

describe("keyed matches (#1350)", () => {
  it("deal from the key, not the seed (#1350)", () => {
    const keyless = start(11);
    const a = start(11, KEY);
    const b = start(11, OTHER_KEY);
    const order = (s: MatchState) => s.players.map((p) => p.zoneInstanceIds.deck.join());
    expect(order(a)).not.toEqual(order(keyless));
    expect(order(a)).not.toEqual(order(b));
    expect(order(start(11, KEY))).toEqual(order(a));
    expect(a.rng.key).toBe(KEY);
    expect(keyless.rng.key).toBeUndefined();
  });

  it("replays a keyed game exactly, and a replay without the key does not (#1350)", () => {
    let state = skipMulligans(start(5, KEY));
    const intents: MatchReplay["intents"] = [];
    for (let i = 0; i < 60 && state.winner === null; i++) {
      const seat = ([0, 1] as Seat[]).find((s) => listLegalIntents(state, s).length > 0)!;
      const legal = listLegalIntents(state, seat);
      const intent = legal.find((x) => x.type === "play_card") ?? legal.find((x) => x.type.startsWith("pass")) ?? legal.find((x) => x.type === "end_turn") ?? legal[0]!;
      const result = applyIntent(state, intent, { seat });
      expect(result.ok).toBe(true);
      state = result.state;
      intents.push({ seat, intent });
    }
    const replay: MatchReplay = { schema: MATCH_REPLAY_SCHEMA, rulesVersion: "t", registryHash: "t", seed: 5, rngKey: KEY, firstSeat: 0, skipMulligans: true, lifeCheckEveryHit: true, privateChoicesV2: true, players, intents };
    const replayed = replayMatch(JSON.parse(JSON.stringify(replay)));
    expect(state.rng.key).toBe(KEY);
    expect(replayed.rng).toEqual(state.rng);
    expect(replayed.players.map((p) => p.zoneInstanceIds.deck)).toEqual(state.players.map((p) => p.zoneInstanceIds.deck));
    const { rngKey: _dropped, ...withoutKey } = replay;
    expect(() => replayMatch(withoutKey)).toThrow();
  });

  it("derive instance ids from the key too, so ids do not expose the seed (#1350)", () => {
    const ids = (s: MatchState) => s.players[0].zoneInstanceIds.deck.join();
    expect(ids(start(11, KEY))).not.toBe(ids(start(11)));
    expect(ids(start(11, KEY))).not.toBe(ids(start(11, OTHER_KEY)));
  });

  it("keep the key through a reseed, drawing from a fresh stream (#1350)", () => {
    const state = start(3, KEY);
    const reseeded = reseedMatch(state, 99, true);
    expect(reseeded.rng.seed).toBe(99);
    expect(reseeded.rng.key).toBe(KEY);
    expect(reseeded.players[0].zoneInstanceIds.deck).not.toEqual(state.players[0].zoneInstanceIds.deck);
  });

  it("round-trip through serializeMatch and refuse a malformed key (#1350)", () => {
    const state = start(3, KEY);
    expect(deserializeMatch(serializeMatch(state)).rng).toEqual(state.rng);
    const bad = { ...state, rng: { ...state.rng, key: "nope" } };
    expect(() => serializeMatch(bad)).toThrow(IncompatibleSnapshotError);
  });

  it("never put the key or rng in a player view, spectator view or seat log (#1350)", () => {
    const state = skipMulligans(start(9, KEY));
    const texts = [
      JSON.stringify(getPlayerView(state, 0)),
      JSON.stringify(getPlayerView(state, 1)),
      JSON.stringify(getSpectatorView(state, 0, { revealHands: false })),
      JSON.stringify(getSpectatorView(state, 1, { revealHands: true })),
    ];
    const replay: MatchReplay = { schema: MATCH_REPLAY_SCHEMA, rulesVersion: "t", registryHash: "t", seed: 9, rngKey: KEY, firstSeat: 0, skipMulligans: true, lifeCheckEveryHit: true, privateChoicesV2: true, players, intents: [] };
    for (const reveal of [false, true]) for (const seat of [0, 1] as Seat[]) texts.push(JSON.stringify(seatLog(replay, seat, { revealOpponent: reveal })));
    for (const text of texts) {
      expect(text).not.toContain(KEY);
      expect(text).not.toContain('"rng"');
      expect(text).not.toContain('"cursor"');
    }
  });
});
