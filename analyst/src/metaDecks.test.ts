import { describe, expect, it } from "vitest";
import { bestDeck, expandDeck, fetchSelfPlayDecks } from "./metaDecks";

const cards = (n: number, id = "OP01-016") => [{ card_id: id, count: n }];
const full = [{ card_id: "OP01-016", count: 4 }, ...Array.from({ length: 46 }, (_, i) => ({ card_id: `OP02-${String(i + 1).padStart(3, "0")}`, count: 1 }))];

describe("meta decks for self-play (#635)", () => {
  it("repeats each card by its copies and accepts exactly fifty (#635)", () => {
    expect(expandDeck(full)).toHaveLength(50);
    expect(expandDeck(full)!.filter((id) => id === "OP01-016")).toHaveLength(4);
    expect(expandDeck(cards(49))).toBeNull();
    expect(expandDeck(cards(51))).toBeNull();
  });

  it("takes the best-placed complete deck, then the newest, and skips incomplete lists (#635)", () => {
    const decks = [
      { placing: 1, date: "2026-10-01", event: "Cut", cards: cards(30) },
      { placing: 4, date: "2026-10-02", event: "Fourth old", cards: full },
      { placing: 2, date: "2026-09-01", event: "Second", cards: full },
      { placing: null, date: "2026-10-15", event: "Unplaced", cards: full },
    ];
    expect(bestDeck(decks)!.deck.event).toBe("Second");
    expect(bestDeck(decks.filter((d) => d.placing === null || d.placing === 4))!.deck.event).toBe("Fourth old");
    expect(bestDeck([decks[0]!])).toBeNull();
  });

  it("builds one deck per leader for the most-played leaders, from the public meta endpoints (#635)", async () => {
    const urls: string[] = [];
    const leaders = { leaders: [{ leader_id: "OP02-001", name: "Few", decks: 2 }, { leader_id: "OP01-001", name: "Many", decks: 9 }, { leader_id: "OP03-001", name: "Mid", decks: 5 }, { leader_id: "OP04-001", name: "Broken", decks: 7 }] };
    const fetchImpl = (async (url: string) => {
      urls.push(url);
      const u = new URL(url);
      if (u.pathname === "/meta/leaders") return new Response(JSON.stringify(leaders));
      const leader = u.searchParams.get("leader")!;
      const decks = leader === "OP04-001" ? [{ placing: 1, cards: cards(10) }] : [{ placing: 3, date: "2026-10-01", event: `Cup ${leader}`, cards: full }];
      return new Response(JSON.stringify({ decks }));
    }) as unknown as typeof fetch;
    const out = await fetchSelfPlayDecks("https://api.test/", { leaders: 2, days: 14, fetchImpl });
    expect(out.map((d) => d.leaderId)).toEqual(["OP01-001", "OP03-001"]);
    expect(out[0]!.deck).toHaveLength(50);
    expect(out[0]!.name).toContain("Cup OP01-001");
    expect(urls[0]).toBe("https://api.test/meta/leaders?days=14");
    expect(new URL(urls[1]!).searchParams.get("days")).toBe("14");
    // A leader whose best list is incomplete is skipped, not counted toward the limit.
    const all = await fetchSelfPlayDecks("https://api.test", { leaders: 4, fetchImpl });
    expect(all.map((d) => d.leaderId)).toEqual(["OP01-001", "OP03-001", "OP02-001"]);
  });

  it("reports a failing endpoint (#635)", async () => {
    const fetchImpl = (async () => new Response("{}", { status: 503 })) as unknown as typeof fetch;
    await expect(fetchSelfPlayDecks("https://api.test", { fetchImpl })).rejects.toThrow(/HTTP 503/);
  });
});
