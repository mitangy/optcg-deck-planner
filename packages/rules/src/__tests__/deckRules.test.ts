import { describe, expect, it } from "vitest";
import { BOT_META_DECKS } from "../botMetaDecks.js";
import { deckConstructionErrors } from "../cards/deckRules.js";

const repeat = (id: string, n: number) => Array.from({ length: n }, () => id);
const matching = (errors: string[], re: RegExp) => errors.filter((e) => re.test(e));

describe("deck construction rules (#1341)", () => {
  it("a legal 50-card meta deck has no construction errors (#1341)", () => {
    for (const d of BOT_META_DECKS) expect(deckConstructionErrors(d.leaderId, d.deck)).toEqual([]);
  });

  it("a deck must have exactly 50 cards (#1341)", () => {
    const { leaderId, deck } = BOT_META_DECKS[0]!;
    expect(deckConstructionErrors(leaderId, deck.slice(1))).toEqual([expect.stringContaining("exactly 50 cards (this one has 49)")]);
    expect(matching(deckConstructionErrors(leaderId, [...deck, deck[0]!]), /exactly 50/)).toEqual([expect.stringContaining("(this one has 51)")]);
  });

  it("more than 4 copies of one card number is refused, 4 is fine (#1341)", () => {
    expect(matching(deckConstructionErrors("OP01-001", repeat("ST01-003", 5)), /at most 4 copies/)).toEqual([expect.stringContaining("ST01-003 (5)")]);
    expect(matching(deckConstructionErrors("OP01-001", repeat("ST01-003", 4)), /copies/)).toEqual([]);
  });

  it("alternate art copies of a card count towards the same limit (#1341)", () => {
    expect(matching(deckConstructionErrors("OP01-001", [...repeat("ST01-003", 3), "ST01-003_p1", "ST01-003_p2"]), /at most 4 copies/)).toHaveLength(1);
  });

  it("any_number cards may exceed 4 copies (#1341)", () => {
    expect(matching(deckConstructionErrors("EB02-010", repeat("OP08-072", 20)), /copies/)).toEqual([]);
  });

  it("every card must share a color with the Leader (#1341)", () => {
    expect(matching(deckConstructionErrors("OP01-001", ["ST01-003", "OP01-051"]), /share a color/)).toEqual([expect.stringContaining("OP01-051")]);
    expect(matching(deckConstructionErrors("OP01-001", ["ST01-003"]), /share a color/)).toEqual([]);
  });

  it("a two-color Leader accepts either of its colors but nothing else (#1341)", () => {
    const errors = (deck: string[]) => matching(deckConstructionErrors("EB01-001", deck), /share a color/);
    expect(errors(["ST01-003", "EB01-012"])).toEqual([]);
    expect(errors(["ST01-003", "OP09-076"])).toEqual([expect.stringContaining("OP09-076")]);
  });
});
