import { describe, expect, it } from "vitest";
import cases from "../../../packages/card-core/fixtures/shopping-cases.json";
import { deckAltsOwned } from "../pages/collection/collectorLines";
import { remainingCostForCard, splitStillNeed } from "../pages/shopping/deckCost";
import { stillNeedFor } from "./optimistic";

type Case = (typeof cases.cases)[number];

describe("shopping maths matches the shared cases the API is tested against (#1346)", () => {
  it.each(cases.cases as Case[])("$id (#1346)", (c) => {
    const alts = c.alt_arts;
    const altsOwned = deckAltsOwned(alts.reduce((n, a) => n + a.owned, 0), alts);
    const still = stillNeedFor(c.need, c.owned, altsOwned, c.earlier_leaders_need);
    const card = { still_need: still, market_price: c.market_price, alt_arts: alts };
    const split = splitStillNeed(card);
    const e = c.expected;
    expect(altsOwned).toBe(e.deck_alts_owned);
    expect(still).toBe(e.still_need);
    expect(split.altCopies).toBe(e.buys.filter((b) => b.product_id !== null).reduce((n, b) => n + b.qty, 0));
    expect(split.baseCopies).toBe(e.buys.filter((b) => b.product_id === null).reduce((n, b) => n + b.qty, 0));
    expect(remainingCostForCard(card)).toBe(e.remaining_cost);
  });
});
