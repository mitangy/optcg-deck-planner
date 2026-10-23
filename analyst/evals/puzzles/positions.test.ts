import { describe, expect, it } from "vitest";
import { loadCatalog } from "../../src/catalog";
import { fixtureReplay } from "../review-facts/game";
import { shownCardIds } from "./describe";
import { isIdleMain, newSetDeck, plainState, samplableState, samplePositions, selfPlayPositions, syntheticPositions } from "./positions";
import { NEW_SET } from "./types";
import { board, KAROO, rng } from "./testkit";

const catalog = loadCatalog();

describe("positions from a self-play game", () => {
  it("are idle Main Phases of different turns, in game order (#677)", () => {
    const replay = fixtureReplay();
    const positions = samplePositions(replay, rng(1), 99, "fx");
    expect(positions.length).toBeGreaterThan(3);
    for (const p of positions) {
      expect(isIdleMain(p.state)).toBe(true);
      expect(plainState(p.state)).toBe(true);
    }
    const turns = positions.map((p) => p.state.turnNumber);
    expect(new Set(turns).size).toBe(turns.length);
    expect(turns).toEqual([...turns].sort((a, b) => a - b));
  });

  it("are the same for the same seed (#677)", () => {
    const a = samplePositions(fixtureReplay(), rng(3), 3, "fx").map((p) => p.source);
    const b = samplePositions(fixtureReplay(), rng(3), 3, "fx").map((p) => p.source);
    expect(a).toEqual(b);
    expect(a).toHaveLength(3);
  });
});

describe("self-play games for a seed", () => {
  it("are the same games every time and other games for another seed (#677)", () => {
    const sources = (seed: number) => selfPlayPositions({ seed, games: 2, perGame: 2, newShare: 0, catalog }).map((p) => p.source);
    expect(sources(1)).toEqual(sources(1));
    expect(sources(1)).not.toEqual(sources(2));
    expect(sources(1).every((s) => /^selfplay seed 10000\d intent \d+$/.test(s))).toBe(true);
  });
});

describe("what makes a state a position", () => {
  it("is not one while a choice is pending or a battle is on (#677)", () => {
    const h = board();
    expect(samplableState(h.state)).toBe(true);
    h.state.phase = "counter";
    expect(isIdleMain(h.state)).toBe(false);
  });

  it("is not one while a buff the text could not show is in play, but a marker does not matter (#677)", () => {
    const h = board();
    const leaderId = h.state.players[0].leader.id;
    h.state.modifiers.push({ id: "m1", sourceSeat: 0, target: { kind: "card", id: leaderId }, effect: { type: "flag", flag: "battled_character" }, expires: { kind: "end_of_turn", turn: h.state.turnNumber } });
    expect(plainState(h.state)).toBe(true);
    h.state.modifiers.push({ id: "m2", sourceSeat: 0, target: { kind: "card", id: leaderId }, effect: { type: "power", amount: 2000 }, expires: { kind: "end_of_turn", turn: h.state.turnNumber } });
    expect(plainState(h.state)).toBe(false);
  });

  it("is not one when this turn's record (events played, K.O.s) could change what a card does (#677)", () => {
    const h = board();
    h.state.players[0].turnLog = { turn: h.state.turnNumber, events: [KAROO], koed: [], handTrashed: 0 };
    expect(plainState(h.state)).toBe(false);
    h.state.players[0].turnLog = { turn: h.state.turnNumber - 1, events: [KAROO], koed: [], handTrashed: 0 };
    expect(plainState(h.state)).toBe(true);
  });
});

describe("Harness boards", () => {
  it("are the same for the same seed and different for another (#677)", () => {
    const sig = (seed: number) => syntheticPositions({ seed, count: 4, newShare: 0.5, catalog }).map((p) => JSON.stringify([p.state.players[0].hand.map((c) => c.defId), p.state.players[1].characters.map((c) => c.defId)]));
    expect(sig(1)).toEqual(sig(1));
    expect(sig(1)).not.toEqual(sig(2));
  });

  it("lean on OP18 and EB05 cards when asked for the newest sets (#677)", () => {
    const withNew = (share: number) =>
      syntheticPositions({ seed: 5, count: 24, newShare: share, catalog }).filter((p) => {
        const ids = [0, 1].flatMap((s) => shownCardIds(p.state, s as 0 | 1));
        return ids.some((id) => NEW_SET.test(id));
      }).length;
    expect(withNew(1)).toBeGreaterThanOrEqual(18);
    expect(withNew(1)).toBeGreaterThan(withNew(0));
  });

  it("have attached DON!!, rested and just-played Characters, and a hand (#677)", () => {
    const positions = syntheticPositions({ seed: 2, count: 30, newShare: 0.3, catalog });
    const all = positions.flatMap((p) => p.state.players.flatMap((pl) => [pl.leader, ...pl.characters]));
    expect(all.some((c) => c.attachedDonIds.length > 0)).toBe(true);
    expect(all.some((c) => c.rested)).toBe(true);
    expect(all.some((c) => c.summoningSick)).toBe(true);
    expect(positions.every((p) => p.state.players[0].hand.length >= 3)).toBe(true);
  });
});

describe("decks for the newest sets", () => {
  it("hold four copies of several OP18 or EB05 cards, the same every time for a seed (#677)", () => {
    const a = newSetDeck(rng(4), catalog);
    const b = newSetDeck(rng(4), catalog);
    expect(a).toEqual(b);
    expect(a.deck.filter((id) => NEW_SET.test(id)).length).toBeGreaterThanOrEqual(8);
    expect(a.deck).toHaveLength(50);
  });
});
