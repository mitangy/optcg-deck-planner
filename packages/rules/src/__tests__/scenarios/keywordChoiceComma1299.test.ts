/**
 * Bandai prints a keyword choice as "[A], [B] or [C]" (no comma before "or"); TCGPlayer printed "[A], [B], or [C]".
 * Both must compile to the same pick-one-keyword effect (#1299).
 */
import { describe, expect, it } from "vitest";
import { cardDataFor } from "../../cards/cardData.js";
import { compileCardText } from "../../tools/cardText/compileCard.js";

const labels = (out: ReturnType<typeof compileCardText>) =>
  (out.abilities as any[])[0]?.effect?.steps?.[1]?.options?.map((o: { label: string }) => o.label);

describe("keyword choice wording (#1299)", () => {
  it("OP18-085 compiles its keyword choice without the comma before \"or\" (#1299)", () => {
    const row = cardDataFor("OP18-085")!;
    expect(row.text).toContain("[Rush], [Banish] or [Unblockable]");
    const out = compileCardText("OP18-085", row);
    expect(out.unsupported).toEqual([]);
    expect(labels(out)).toEqual(["Gain [Rush]", "Gain [Banish]", "Gain [Unblockable]"]);
    const withComma = compileCardText("OP18-085", { ...row, text: row.text.replace("[Banish] or", "[Banish], or") });
    expect(withComma.abilities.map((a) => ({ ...a, text: "" }))).toEqual(out.abilities.map((a) => ({ ...a, text: "" })));
  });
});
