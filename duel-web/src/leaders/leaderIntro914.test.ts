import { describe, expect, it } from "vitest";
import leadersFixture from "../decks/metaLeaders.fixture.json";
import decksFixture from "../decks/metaDecks.fixture.json";
import type { MetaDeck, MetaLeader } from "../decks/meta";
import { bestFinish, colorList, leaderIntro, sharedCards } from "./leaderIntro";

const leader = leadersFixture.leaders[0] as MetaLeader;
const decks = decksFixture.decks as MetaDeck[];

describe("leader page intro (#914)", () => {
  it("reads colours from the API's semicolon list (#914)", () => {
    expect(colorList("Green;Red")).toEqual(["green", "red"]);
  });

  it("says the numbers of that leader, so two leaders never get the same text (#914)", () => {
    const a = leaderIntro({ leader, rank: 1, of: 12, days: 30, decks: [] }).join(" ");
    expect(a).toContain(`${leader.decks} tournament decks`);
    expect(a).toContain("the most played of the 12 leaders");
    expect(a).toContain(`${leader.wins}-${leader.losses}`);
    const b = leaderIntro({ leader: { ...leader, decks: 7, wins: 3, losses: 9 }, rank: 3, of: 12, days: 30, decks: [] }).join(" ");
    expect(b).toContain("7 tournament decks");
    expect(b).toContain("the 3rd most played");
    expect(b).not.toBe(a);
  });

  it("calls a win rate under 50% below an even record and one over it at or above (#914)", () => {
    const text = (win_rate: number) => leaderIntro({ leader: { ...leader, win_rate }, rank: 2, of: 5, days: 30, decks: [] })[1];
    expect(text(0.45)).toContain("below an even 50%");
    expect(text(0.6)).toContain("at or above an even 50%");
  });

  it("names the best finish among the lists and the cards every list plays (#914)", () => {
    const best = bestFinish(decks);
    expect(best?.placing).toBe(1);
    const shared = sharedCards(decks);
    for (const c of shared) expect(decks.every((d) => d.cards.some((x) => x.name === c.name))).toBe(true);
    // A card only one list plays is not "in every list".
    const dropFirst = { ...decks[0], cards: decks[0].cards.slice(1) };
    const partial = sharedCards([decks[0], dropFirst]).map((s) => s.name);
    expect(partial).not.toContain(decks[0].cards[0].name);
    expect(partial).toContain(decks[0].cards[1].name);
    const text = leaderIntro({ leader, rank: 1, of: 12, days: 30, decks }).join(" ");
    expect(text).toContain(`All ${decks.length} lists below play`);
  });

  it("lists nothing as shared with fewer than two lists and picks the lowest placing (#914)", () => {
    expect(sharedCards([decks[0]])).toEqual([]);
    const worse = { ...decks[0], placing: 9 };
    const better = { ...decks[0], placing: 2 };
    expect(bestFinish([worse, better])?.placing).toBe(2);
    expect(bestFinish([{ ...decks[0], placing: null }])).toBeNull();
  });
});
