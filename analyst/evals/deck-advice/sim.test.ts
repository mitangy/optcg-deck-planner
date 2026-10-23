import { describe, expect, it } from "vitest";
import { loadCatalog } from "../../src/catalog";
import { fixtureDecks } from "./fixture";
import { compareSims, inProcess, lostSignificantly, simJobs, simulate, tally, type Outcome, type SimDeck, type SimRun } from "./sim";

const decks = fixtureDecks();
const asSim = (d: { leaderId: string; deck: string[] }): SimDeck => ({ leaderId: d.leaderId, deck: d.deck });
const mine = asSim(decks[0]!);
const field = decks.slice(1).map(asSim);
const result = (wins: number, losses: number) => tally([...Array<Outcome>(wins).fill("win"), ...Array<Outcome>(losses).fill("loss")]);

describe("simulation jobs", () => {
  it("give every version of a deck the same seeds, seats and first player against the same opponent (#678)", () => {
    const a = simJobs(mine, field, { games: 8, seed: 100 });
    const b = simJobs({ ...mine, deck: [...mine.deck].reverse().slice(0, 49) }, field, { games: 8, seed: 100 });
    expect(b.map((j) => [j.seed, j.mySeat, j.firstSeat, j.opponent])).toEqual(a.map((j) => [j.seed, j.mySeat, j.firstSeat, j.opponent]));
    expect(a).toHaveLength(8 * field.length);
  });

  it("uses a different seed for every game and plays every seat and first player combination (#678)", () => {
    const jobs = simJobs(mine, field, { games: 8, seed: 100 });
    expect(new Set(jobs.map((j) => j.seed)).size).toBe(jobs.length);
    expect(new Set(jobs.map((j) => `${j.mySeat}${j.firstSeat}`)).size).toBe(4);
  });

  it("adds up to the same totals however the games are split and ordered (#678)", async () => {
    const backwards: SimRun = async (jobs) => {
      const chunks = [jobs.slice(0, 2), jobs.slice(2)];
      const out = await Promise.all(chunks.reverse().map((c) => inProcess(c)));
      return [...out].reverse().flat();
    };
    const opts = { games: 2, seed: 5 };
    expect(await simulate(mine, field, opts, backwards)).toEqual(await simulate(mine, field, opts, inProcess));
  });
});

describe("comparing two simulations", () => {
  it("gives a wider interval for fewer games at the same win rates (#678)", () => {
    const few = compareSims(result(5, 5), result(6, 4));
    const many = compareSims(result(50, 50), result(60, 40));
    expect(few.diff).toBeCloseTo(0.1);
    expect(many.diff).toBeCloseTo(0.1);
    expect(few.hi - few.lo).toBeGreaterThan(many.hi - many.lo);
  });

  it("measures after minus before and calls a change lost only when the whole interval is below zero (#678)", () => {
    const worse = compareSims(result(60, 40), result(30, 70));
    expect(worse.diff).toBeCloseTo(-0.3);
    expect(lostSignificantly(worse)).toBe(true);
    expect(lostSignificantly(compareSims(result(6, 4), result(5, 5)))).toBe(false);
    expect(lostSignificantly(compareSims(result(30, 70), result(60, 40)))).toBe(false);
  });

  it("ignores games that did not finish when it takes a win rate (#678)", () => {
    const r = tally(["win", "loss", "unfinished", "unfinished"]);
    expect(r).toMatchObject({ games: 4, wins: 1, losses: 1, unfinished: 2, winRate: 0.5 });
  });
});

describe("playing the bots", () => {
  it("finds a deck of vanilla cards clearly worse than the meta deck it was built from (#678)", async () => {
    const catalog = loadCatalog();
    // ST30-001 wins about half its games against the other three fixture decks; the vanilla pile wins about one in ten.
    const strong = asSim(decks[1]!);
    const rest = [decks[0]!, decks[2]!, decks[3]!].map(asSim);
    const leader = catalog.cards.get(strong.leaderId)!;
    const vanilla = [...catalog.cards.values()].filter((c) => c.type === "character" && c.support === "vanilla" && c.colors.every((x) => leader.colors.includes(x)));
    const weak: SimDeck = { leaderId: strong.leaderId, deck: vanilla.slice(0, 13).flatMap((c) => Array<string>(4).fill(c.id)).slice(0, 50) };
    expect(weak.deck).toHaveLength(50);
    const opts = { games: 8, seed: 11 };
    const before = await simulate(strong, rest, opts);
    const after = await simulate(weak, rest, opts);
    const c = compareSims(before, after);
    expect(after.winRate!).toBeLessThan(before.winRate!);
    expect(lostSignificantly(c)).toBe(true);
    // The other way round it is a clear gain.
    expect(compareSims(after, before).lo).toBeGreaterThan(0);
  }, 120_000);
});
