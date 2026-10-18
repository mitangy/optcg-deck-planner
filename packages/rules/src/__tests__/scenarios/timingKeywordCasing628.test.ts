/**
 * TCGPlayer prints some timing keywords with different casing ("[On your Opponent's Attack]"). The text compiler folds
 * the bracketed keyword to its canonical form so the card compiles like its Bandai-cased siblings (#628).
 */
import { describe, expect, it } from "vitest";
import { cardDataFor } from "../../cards/cardData.js";
import { compileCardText } from "../../tools/cardText/compileCard.js";

describe("timing keyword casing (#628)", () => {
  it("OP18-015 compiles its lowercase [On your Opponent's Attack] into a trash-self, Leader-type gated -3000 (#628)", () => {
    const row = cardDataFor("OP18-015")!;
    expect(row.text).toContain("[On your Opponent's Attack]");
    const out = compileCardText("OP18-015", row);
    expect(out.status).toBe("supported");
    expect(out.unsupported).toEqual([]);
    const [ability] = out.abilities as any[];
    expect(ability.trigger).toBe("on_opp_attack");
    expect(ability.costs).toEqual([{ k: "trash_self" }]);
    expect(ability.effect.cond).toEqual({ c: "leader_trait", traits: ["Alabasta"] });
    expect(ability.effect.then).toMatchObject({ do: "power", amount: -3000, duration: "turn", target: { selector: { player: "opponent", zone: "leader_or_character" }, max: 1 } });
  });

  it("a lowercase timing keyword compiles the same as the canonical casing (#628)", () => {
    const row = cardDataFor("OP18-015")!;
    const canon = compileCardText("X", { ...row, text: row.text.replace("[On your Opponent's Attack]", "[On Your Opponent's Attack]") });
    const lower = compileCardText("X", { ...row, text: row.text.replace("[On your Opponent's Attack]", "[on your opponent's attack]") });
    expect(lower.status).toBe("supported");
    expect(lower.abilities.map((a) => ({ ...a, text: "" }))).toEqual(canon.abilities.map((a) => ({ ...a, text: "" })));
  });
});
