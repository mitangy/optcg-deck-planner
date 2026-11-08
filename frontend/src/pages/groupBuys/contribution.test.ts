import { describe, expect, it } from "vitest";
import { contributionSummary, contributionUpdate } from "./contribution";

describe("group buy contribution (#1177)", () => {
  it("a flag toggle keeps the current deck pick and the other flag", () => {
    const body = contributionUpdate(
      { deck_ids: [3, 4], include_singles: false, include_extra_copies: false },
      { include_extra_copies: true },
    );
    expect(body).toEqual({ deck_ids: [3, 4], include_singles: false, include_extra_copies: true });
  });

  it("a deck change keeps the flags, and null means all decks", () => {
    const body = contributionUpdate(
      { deck_ids: [3], include_singles: false, include_extra_copies: true },
      { deck_ids: null },
    );
    expect(body).toEqual({ deck_ids: null, include_singles: false, include_extra_copies: true });
  });

  it("summarises only the non-default settings", () => {
    const base = {
      deckCount: 3,
      selectedDeckCount: 3,
      allDecksSelected: true,
      includeSingles: true,
      includeExtraCopies: false,
    };
    expect(contributionSummary(base)).toEqual([]);
    expect(
      contributionSummary({
        ...base,
        selectedDeckCount: 2,
        allDecksSelected: false,
        includeSingles: false,
        includeExtraCopies: true,
      }),
    ).toEqual(["2/3 decks", "No singles", "Extra copies"]);
  });
});
