import { describe, expect, it } from "vitest";
import { loadCatalog } from "../../src/catalog";
import { fixtureReplay } from "../review-facts/game";
import { shownCardIds } from "./describe";
import { applyIntent, listLegalIntents } from "@optcg/rules";
import { Harness } from "@optcg/rules/src/testing/harness";
import { isIdleMain, lethalPool, lethalPosition, newSetDeck, plainState, samplableState, samplePositions, selfPlayPositions, syntheticPositions } from "./positions";
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

describe("the cards of a lethal board", () => {
  const pool = lethalPool(catalog);
  const row = (id: string) => catalog.cards.get(id)!;

  it("are Characters with no text but keywords, Leaders with only static text and Counter Events that only add power (#685)", () => {
    expect(pool.chars.length).toBeGreaterThan(100);
    for (const id of pool.chars) {
      const c = row(id);
      expect(c.text.replace(/\([^)]*\)/g, "").replace(/\[(Blocker|Rush|Double Attack|Banish)\]/g, "").trim(), id).toBe("");
      expect(c.trigger, id).toBe("");
      expect(c.keywords.every((k) => ["Blocker", "Rush", "Double Attack", "Banish"].includes(k)), id).toBe(true);
    }
    for (const id of pool.leaders) expect(row(id).timings, id).toEqual([]);
    expect(pool.events.length).toBeGreaterThan(0);
    for (const id of pool.events) expect(row(id).effects, id).toEqual(["power"]);
    expect(row(pool.lifeFiller).counter ?? 0).toBe(0);
    expect(row(pool.lifeFiller).trigger).toBe("");
  });

  it("run through the engine with no question but which card gets the power (#685)", () => {
    expect(pool.events.length).toBeGreaterThan(0);
    for (const id of pool.events) {
      const h = new Harness({ leaders: [pool.attackLeaders[0]!, pool.leaders[0]!], deckSize: 20 });
      h.don(0, 1);
      h.don(1, 3);
      h.field(0, pool.chars[0]!);
      h.field(1, pool.chars[1]!, pool.chars[2]!);
      h.hand(1, id);
      h.act(0, { type: "declare_attack", attackerId: h.state.players[0].leader.id, target: { kind: "leader" } });
      h.act(1, { type: "pass_block" });
      const play = listLegalIntents(h.state, 1).find((i) => i.type === "counter_event");
      expect(play, id).toBeDefined();
      const r = applyIntent(h.state, play!, { seat: 1, rng: h.rng });
      expect(r.ok, id).toBe(true);
      const asks = r.state.pendingChoices.map((c) => c.request?.type);
      expect(asks.every((t) => t === "select"), id).toBe(true);
      expect(asks.length, id).toBeLessThanOrEqual(1);
    }
  });

  it("leave out a Leader whose DON!! changes other cards' power, which giving DON!! just before an attack relies on (#685)", () => {
    expect(row("OP01-001").text).toContain("All of your Characters gain +1000 power");
    expect(pool.leaders).toContain("OP01-001");
    expect(pool.attackLeaders).not.toContain("OP01-001");
    expect(pool.attackLeaders).toContain("OP17-079");
  });
});

describe("lethal boards", () => {
  it("hold a Leader and 1 to 3 Characters able to attack, 1 to 5 active DON!!, and a short face-up defence (#685)", () => {
    for (let seed = 1; seed <= 40; seed += 1) {
      const { state } = lethalPosition(rng(seed), catalog, seed % 2 === 0, `l${seed}`);
      const [me, opp] = state.players;
      expect(me.characters.length, `seed ${seed}`).toBeGreaterThanOrEqual(1);
      expect(me.characters.length, `seed ${seed}`).toBeLessThanOrEqual(3);
      const active = me.costArea.filter((d) => !d.rested).length;
      expect(active).toBeGreaterThanOrEqual(1);
      expect(active).toBeLessThanOrEqual(5);
      expect(me.hand).toHaveLength(0);
      expect(opp.life.length).toBeLessThanOrEqual(2);
      expect(opp.characters.length).toBeLessThanOrEqual(2);
      expect(opp.hand.length).toBeLessThanOrEqual(3);
      expect(opp.life.every((id) => id === lethalPool(catalog).lifeFiller)).toBe(true);
      expect(listLegalIntents(state, 0).some((i) => i.type === "declare_attack" && i.target.kind === "leader")).toBe(true);
    }
  });

  it("are the same for the same seed, and use only cards of the pool (#685)", () => {
    const pool = lethalPool(catalog);
    const sig = (seed: number) => {
      const s = lethalPosition(rng(seed), catalog, false, "x").state;
      return JSON.stringify([s.players.map((p) => [p.leader.defId, p.characters.map((c) => c.defId), p.hand.map((c) => c.defId)])]);
    };
    expect(sig(3)).toEqual(sig(3));
    expect(sig(3)).not.toEqual(sig(4));
    const s = lethalPosition(rng(9), catalog, false, "x").state;
    for (const c of [...s.players[0].characters, ...s.players[1].characters]) expect(pool.chars).toContain(c.defId);
    for (const c of s.players[1].hand) expect([...pool.counterChars, ...pool.events]).toContain(c.defId);
    expect(pool.attackLeaders).toContain(s.players[0].leader.defId);
  });

  it("lean on OP18 and EB05 cards when asked for the newest sets (#685)", () => {
    const withNew = (want: boolean) =>
      Array.from({ length: 30 }, (_, i) => lethalPosition(rng(i + 1), catalog, want, `n${i}`).state).filter((s) => [0, 1].flatMap((seat) => shownCardIds(s, seat as 0 | 1, [], true)).some((id) => NEW_SET.test(id))).length;
    expect(withNew(true)).toBeGreaterThan(withNew(false) + 5);
  });
});
