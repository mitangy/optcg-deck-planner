import { describe, expect, it } from "vitest";
import { CLAIMS_JSON_SCHEMA, guardQuotes, parseClaims, scriptedExtractor, type Claim } from "./extract";

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

  it("sends no enum with a list of types, which the API rejects (#683)", () => {
    const bad: string[] = [];
    const walk = (node: unknown, path: string) => {
      if (!node || typeof node !== "object") return;
      const n = node as Record<string, unknown>;
      if (Array.isArray(n.enum) && Array.isArray(n.type)) bad.push(path);
      for (const [k, v] of Object.entries(n)) walk(v, `${path}.${k}`);
    };
    walk(CLAIMS_JSON_SCHEMA, "schema");
    expect(bad).toEqual([]);
  });

  it("reads the actor \"none\" the API sends back as a claim with no actor (#683)", () => {
    const { claims, invalid } = parseClaims(JSON.stringify({ claims: [{ ...claim("a"), actor: "none" }] }));
    expect(invalid).toBe(0);
    expect(claims[0]!.actor).toBeNull();
  });

  it("keeps a claim about DON!!, hand size, the board or the trash (#687)", () => {
    const kinds = ["don", "hand_size", "on_board", "trashed"] as const;
    const { claims, invalid } = parseClaims(JSON.stringify({ claims: kinds.map((kind) => ({ ...claim("a"), kind })) }));
    expect(invalid).toBe(0);
    expect(claims.map((c) => c.kind)).toEqual([...kinds]);
  });
});
