/**
 * "Place up to 1 X and up to 1 Y at the bottom of the owner's deck in any order of their choosing" (OP18-051) goes
 * through the verb-distribution rule and then the single-target place rule; both must accept the full tail (#759).
 */
import { describe, expect, it } from "vitest";
import { cardDataFor } from "../../cards/cardData.js";
import { compileCardText } from "../../tools/cardText/compileCard.js";

describe("verb distribution with an 'in any order of their choosing' tail", () => {
  it("OP18-051 compiles both bottom-deck moves, cost 6 or less then cost 5 or less (#759)", () => {
    const row = cardDataFor("OP18-051")!;
    expect(row.text).toContain("in any order of the owner's choosing"); // normalize.ts folds this to "their choosing" before the grammar sees it
    const out = compileCardText("OP18-051", row);
    expect(out.status).toBe("supported");
    expect(out.unsupported).toEqual([]);
    const onPlay = (out.abilities as any[]).find((a) => a.trigger === "on_play");
    expect(onPlay.costs).toEqual([{ k: "rest_don", count: 5 }]);
    expect(onPlay.effect.do).toBe("seq");
    const costs = onPlay.effect.steps.map((s: any) => s.target.selector.filter.cost);
    expect(costs).toEqual([{ op: "<=", value: 6 }, { op: "<=", value: 5 }]);
    for (const s of onPlay.effect.steps) {
      expect(s).toMatchObject({ do: "to_deck", position: "bottom", target: { max: 1, selector: { zone: "character" } } });
    }
  });
});
