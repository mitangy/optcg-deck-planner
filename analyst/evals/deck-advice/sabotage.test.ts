import { describe, expect, it } from "vitest";
import { analyzeDeck } from "../../src/analysis";
import { loadCatalog } from "../../src/catalog";
import { deckFromLines } from "../../src/decks";
import { buildCases } from "./cases";
import { fixtureDecks } from "./fixture";
import { metaFrequency, plantCandidates, sabotage, toCopies } from "./sabotage";

const catalog = loadCatalog();
const decks = fixtureDecks();
const freq = metaFrequency(decks);
const total = (cards: { copies: number }[]) => cards.reduce((s, c) => s + c.copies, 0);

describe("sabotaging a meta deck", () => {
  it("gives the same sabotage for the same seed and another for a different seed (#678)", () => {
    const run = (seed: number) => sabotage(catalog, decks[0]!, { seed, freq })!;
    expect(run(7)).toEqual(run(7));
    const seeds = [1, 2, 3, 4, 5].map((s) => JSON.stringify(run(s).planted));
    expect(new Set(seeds).size).toBeGreaterThan(1);
  });

  it("keeps the deck a legal 50 cards, plants k copies of k from 4 to 8 and records what went in and out (#678)", () => {
    for (const d of decks) {
      for (const seed of [1, 2, 3, 4]) {
        const s = sabotage(catalog, d, { seed, freq })!;
        const original = toCopies(d.deck);
        expect(s.k).toBeGreaterThanOrEqual(4);
        expect(s.k).toBeLessThanOrEqual(8);
        expect(total(s.planted)).toBe(s.k);
        expect(total(s.removed)).toBe(s.k);
        expect(total(s.cards)).toBe(50);
        expect(analyzeDeck(catalog, deckFromLines(catalog, s.cards, d.leaderId)).legal).toBe(true);
        // The sabotaged deck is the original, minus what was removed, plus what was planted.
        const copies = new Map(original.map((c) => [c.id, c.copies]));
        for (const r of s.removed) copies.set(r.id, copies.get(r.id)! - r.copies);
        for (const p of s.planted) copies.set(p.id, (copies.get(p.id) ?? 0) + p.copies);
        expect(toCopies([...copies].flatMap(([id, n]) => Array<string>(n).fill(id)))).toEqual(s.cards);
        for (const p of s.planted) expect(original.some((c) => c.id === p.id)).toBe(false);
      }
    }
  });

  it("uses the k it is given (#678)", () => {
    expect(total(sabotage(catalog, decks[1]!, { seed: 1, k: 6, freq })!.planted)).toBe(6);
  });

  it("takes at most 2 copies out of any one card, from cards the deck plays in numbers (#678)", () => {
    for (const d of decks) {
      for (const seed of [1, 2, 3, 4, 5, 6]) {
        const s = sabotage(catalog, d, { seed, k: 8, freq })!;
        const had = new Map(toCopies(d.deck).map((c) => [c.id, c.copies]));
        for (const r of s.removed) {
          expect(r.copies).toBeLessThanOrEqual(2);
          expect(had.get(r.id)!).toBeGreaterThanOrEqual(3);
        }
      }
    }
  });

  it("plants off-plan cards: vanilla characters that no meta deck plays (#678)", () => {
    for (const d of decks) {
      const s = sabotage(catalog, d, { seed: 3, freq })!;
      for (const p of s.planted) {
        const card = catalog.cards.get(p.id)!;
        expect(card.type).toBe("character");
        expect(card.support).toBe("vanilla");
        expect(freq.get(p.id) ?? 0).toBe(0);
      }
    }
  });

  it("never plants a banned or restricted card (#678)", () => {
    const d = decks[0]!;
    const first = sabotage(catalog, d, { seed: 2, freq })!;
    const ids = first.planted.map((p) => p.id);
    const banned = sabotage(catalog, d, { seed: 2, freq, banned: new Set(ids) })!;
    expect(banned.planted.map((p) => p.id).filter((id) => ids.includes(id))).toEqual([]);
    const restricted = sabotage(catalog, d, { seed: 2, freq, restricted: new Set(ids) })!;
    expect(restricted.planted.map((p) => p.id).filter((id) => ids.includes(id))).toEqual([]);
  });

  it("ranks cards the meta plays last, so the planted ones are cards nobody plays (#678)", () => {
    const d = decks[0]!;
    const none = plantCandidates(catalog, d.leaderId, new Map(), new Set(), new Set());
    const popular = new Map(none.slice(0, 8).map((c) => [c.id, 9]));
    const ranked = plantCandidates(catalog, d.leaderId, popular, new Set(), new Set());
    expect(ranked.slice(0, 8).some((c) => popular.has(c.id))).toBe(false);
  });
});

describe("deck advice cases", () => {
  it("builds each meta deck as is and a sabotaged copy that records its planted cards (#678)", () => {
    const cases = buildCases(catalog, decks, { mode: "all", seed: 1 });
    expect(cases.map((c) => c.id)).toEqual(decks.flatMap((d) => [`meta-${d.leaderId}`, `sabotaged-${d.leaderId}`]));
    for (const c of cases) {
      expect(c.message).toBe(`${c.question}\n\n${c.deckText}`);
      expect(c.deckText.split("\n")[0]).toBe(`1x${c.leaderId}`);
      if (c.kind === "meta") expect(c.planted).toEqual([]);
      else expect(total(c.planted)).toBe(c.k);
      expect(total(c.cards)).toBe(50);
    }
  });

  it("builds only the kind asked for and a seeded, repeatable pick of n (#678)", () => {
    expect(buildCases(catalog, decks, { mode: "meta", seed: 1 }).every((c) => c.kind === "meta")).toBe(true);
    expect(buildCases(catalog, decks, { mode: "sabotaged", seed: 1 }).every((c) => c.kind === "sabotaged")).toBe(true);
    const pick = buildCases(catalog, decks, { mode: "all", seed: 1, n: 3 });
    expect(pick).toHaveLength(3);
    expect(buildCases(catalog, decks, { mode: "all", seed: 1, n: 3 }).map((c) => c.id)).toEqual(pick.map((c) => c.id));
  });
});
