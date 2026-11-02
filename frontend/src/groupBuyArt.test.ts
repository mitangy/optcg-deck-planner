import { describe, expect, it } from "vitest";
import type { PrintingView } from "./api";
import { myArtSplit, mySelectedArtsTotal, qtyForBase } from "./groupBuyArt";

const alt = (product_id: number, name: string, price: number | null, wanted: number): PrintingView => ({
  product_id,
  name,
  market_price: price,
  low_price: null,
  image_url: "",
  tcgplayer_url: "",
  group_name: "",
  is_special: true,
  wanted,
});

// Base (preferred) $1.00; the host's checkout printing market_price is an unrelated $50.
const line = (my_qty: number, alt_arts: PrintingView[], preferred: number | null = 1) => ({
  name: "Luffy",
  my_qty,
  alt_arts,
  preferred_market_price: preferred,
  market_price: 50,
});

describe("myArtSplit", () => {
  it("fills alt wants first and leaves the rest as base (#850)", () => {
    const s = myArtSplit(line(4, [alt(2, "Manga", 9, 1), alt(3, "Parallel", 5, 2)]));
    expect(s.base).toBe(1);
    expect(s.alts.map((a) => [a.product_id, a.qty])).toEqual([
      [2, 1],
      [3, 2],
    ]);
  });

  it("caps alt copies by the buy qty, in alt-list order (#850)", () => {
    // wants total 5 but only 2 copies are bought: first alt takes both, second gets none.
    const s = myArtSplit(line(2, [alt(2, "Manga", 9, 2), alt(3, "Parallel", 5, 3)]));
    expect(s.base).toBe(0);
    expect(s.alts).toEqual([{ product_id: 2, name: "Manga", qty: 2, price: 9 }]);
  });

  it("is all base when no alt is wanted (#850)", () => {
    expect(myArtSplit(line(3, [alt(2, "Manga", 9, 0)]))).toEqual({ base: 3, alts: [] });
  });
});

describe("mySelectedArtsTotal", () => {
  it("sums base at the preferred price plus each picked alt (#850)", () => {
    const t = mySelectedArtsTotal(line(3, [alt(2, "Manga", 9, 1)]));
    expect(t.total).toBe(11); // 2 x $1 base + 1 x $9
    expect(t.copies).toBe(3);
    expect(t.breakdown).toBe("2 × Base $1.00 + 1 × Manga $9.00");
  });

  it("does not price the whole buy as the alt when only some copies want it (#850)", () => {
    expect(mySelectedArtsTotal(line(4, [alt(2, "Manga", 9, 1)])).total).toBe(12);
  });

  it("ignores wants beyond the buy qty (#850)", () => {
    const t = mySelectedArtsTotal(line(1, [alt(2, "Manga", 9, 3)]));
    expect(t.total).toBe(9);
    expect(t.copies).toBe(1);
  });

  it("prices base at the preferred printing, not the checkout printing (#850)", () => {
    expect(mySelectedArtsTotal(line(2, [])).total).toBe(2);
  });

  it("is unknown when a picked art has no price, but unpicked ones do not matter (#850)", () => {
    expect(mySelectedArtsTotal(line(2, [alt(2, "Manga", null, 1)])).total).toBeNull();
    expect(mySelectedArtsTotal(line(2, [alt(2, "Manga", null, 0)])).total).toBe(2);
    expect(mySelectedArtsTotal(line(2, [], null)).total).toBeNull();
  });

  it("rounds to cents (#850)", () => {
    expect(mySelectedArtsTotal(line(3, [], 0.1)).total).toBe(0.3);
  });
});

describe("qtyForBase", () => {
  it("puts the base count on top of every alt want so it is not swallowed by alts (#850)", () => {
    const alts = [alt(2, "Manga", 9, 2), alt(3, "Parallel", 5, 1)];
    // Buying 2 of 3 wanted alt copies leaves base 0; one more base copy needs qty 4, not 3.
    expect(myArtSplit(line(2, alts)).base).toBe(0);
    const qty = qtyForBase({ alt_arts: alts }, 1);
    expect(qty).toBe(4);
    expect(myArtSplit(line(qty, alts)).base).toBe(1);
  });
});
