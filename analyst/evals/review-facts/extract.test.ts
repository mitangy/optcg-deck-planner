import { describe, expect, it } from "vitest";
import { guardQuotes, parseClaims, scriptedExtractor, type Claim } from "./extract";

const claim = (quote: string): Claim => ({ quote, kind: "played", actor: "you", turn: 1, card: "Pearl", target: null, number: null });

describe("claim extraction", () => {
  it("drops a claim whose quote is not in the review, and keeps one with curly quotes or markdown changed (#675)", () => {
    const review = "On **Turn 3** you played Pearl.\n\nThe opponent\u2019s Smoker  attacked.";
    const { kept, dropped } = guardQuotes(review, [claim("On Turn 3 you played Pearl."), claim("The opponent's Smoker attacked."), claim("You played Nami on turn 1.")]);
    expect(kept.map((c) => c.quote)).toEqual(["On Turn 3 you played Pearl.", "The opponent's Smoker attacked."]);
    expect(dropped.map((c) => c.quote)).toEqual(["You played Nami on turn 1."]);
  });

  it("keeps the claims that fit the schema and counts the rest as invalid (#675)", () => {
    const good = claim("a");
    const { claims, invalid } = parseClaims(JSON.stringify({ claims: [good, { ...good, kind: "teleported" }, { quote: "x" }] }));
    expect(claims).toEqual([good]);
    expect(invalid).toBe(2);
  });

  it("reads the dry run's template sentences and nothing else (#675)", async () => {
    const out = await scriptedExtractor("On turn 4, the opponent played Smoker.\nYou should have held back.\nThe opponent won the game.");
    expect(out.claims).toMatchObject([
      { kind: "played", actor: "opponent", turn: 4, card: "Smoker" },
      { kind: "result", actor: "opponent" },
    ]);
  });
});
