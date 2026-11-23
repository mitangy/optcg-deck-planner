import { describe, expect, it } from "vitest";
import type { GroupBuyBoughtArt, PrintingView } from "../../api";
import { boughtAlts, lineEach, mySelectedArtsTotal } from "./groupBuyArt";

const alt = (product_id: number, price: number, wanted = 0): PrintingView => ({
  product_id,
  name: `Art ${product_id}`,
  market_price: price,
  low_price: null,
  image_url: "",
  tcgplayer_url: "",
  group_name: "",
  is_special: true,
  wanted,
});

const bought = (product_id: number | null, qty: number, my_qty: number, unit_price: number | null): GroupBuyBoughtArt => ({
  product_id,
  name: product_id == null ? "Base" : `Art ${product_id}`,
  qty,
  my_qty,
  unit_price,
  paid: true,
});

const base = { name: "Shanks", preferred_market_price: 1, market_price: 50, product_id: 100 };

describe("group buy lines pinned to what was bought (#1443)", () => {
  it("Each is the price paid, not the market price of the art Shopping shows now (#1443)", () => {
    const line = {
      ...base,
      alt_arts: [alt(201, 1451.59), alt(202, 8)],
      display_art: 202,
      bought_arts: [bought(202, 4, 2, 8.35)],
      bought_each: 8.35,
    };
    expect(lineEach(line)).toMatchObject({ price: 8.35, bought: true });
    // Nothing bought yet: the live pick still decides.
    expect(lineEach({ ...line, bought_arts: [], bought_each: null })).toMatchObject({ price: 8, bought: false });
  });

  it("an unpriced bought art leaves Each empty instead of falling back to the live pick (#1443)", () => {
    const line = { ...base, alt_arts: [alt(201, 99)], display_art: 201, bought_arts: [bought(201, 1, 1, null)], bought_each: null };
    expect(lineEach(line).price).toBeNull();
  });

  it("Your share prices bought copies at what was bought and only the rest by live picks (#1443)", () => {
    const line = {
      ...base,
      my_qty: 3,
      my_deck_qty: 3,
      my_extras: [],
      alt_arts: [alt(201, 900, 2), alt(202, 8)],
      bought_arts: [bought(202, 2, 2, 8.35)],
    };
    // 2 copies bought at 8.35; the third is still unordered and follows the live 201 want (900 for it).
    const t = mySelectedArtsTotal(line);
    expect(t.copies).toBe(3);
    expect(t.total).toBeCloseTo(2 * 8.35 + 900, 2);
    // A live pick that moves to an art nobody bought does not touch the bought part.
    const moved = { ...line, alt_arts: [alt(201, 5000, 2), alt(202, 8)] };
    expect(mySelectedArtsTotal(moved).total).toBeCloseTo(2 * 8.35 + 5000, 2);
  });

  it("a fully ordered share ignores every live pick (#1443)", () => {
    const line = {
      ...base,
      my_qty: 2,
      my_deck_qty: 2,
      my_extras: [],
      alt_arts: [alt(201, 900, 2), alt(202, 8)],
      bought_arts: [bought(null, 2, 2, 1.25)],
    };
    expect(mySelectedArtsTotal(line).total).toBeCloseTo(2.5, 2);
  });

  it("the read-only list holds only the alt arts that were bought (#1443)", () => {
    const line = { alt_arts: [alt(201, 5), alt(202, 6), alt(203, 7)], bought_arts: [bought(null, 1, 0, 1), bought(203, 2, 1, 7)] };
    expect(boughtAlts(line).map((a) => a.product_id)).toEqual([203]);
  });
});
