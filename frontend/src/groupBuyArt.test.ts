import { describe, expect, it } from "vitest";
import type { PrintingView } from "./api";
import { myArtSplit, mySelectedArtsTotal, qtyForAltWant, qtyForBase, visibleGroupBuyLines } from "./groupBuyArt";

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

describe("qtyForAltWant", () => {
  it("Raising an alt want adds a copy to Your buy and keeps the Base count (#868)", () => {
    const alts = [alt(2, "Manga", 9, 0), alt(3, "Parallel", 5, 0)];
    // Reported case: Base was taken to 0, so Your buy is 0; + on an alt must give 1.
    expect(qtyForAltWant(line(0, alts), 3, 1)).toBe(1);
    // 3 base, no wants: one alt copy makes 4 and base stays 3.
    const qty = qtyForAltWant(line(3, alts), 2, 1);
    expect(qty).toBe(4);
    const next = [alt(2, "Manga", 9, 1), alt(3, "Parallel", 5, 0)];
    expect(myArtSplit(line(qty, next)).base).toBe(3);
  });

  it("Lowering an alt want removes only that alt copy and keeps the Base count (#868)", () => {
    const alts = [alt(2, "Manga", 9, 2), alt(3, "Parallel", 5, 1)];
    // my_qty 5 = 2 Manga + 1 Parallel + 2 base. Manga 2 -> 1 gives 4, base still 2.
    const qty = qtyForAltWant(line(5, alts), 2, 1);
    expect(qty).toBe(4);
    const next = [alt(2, "Manga", 9, 1), alt(3, "Parallel", 5, 1)];
    expect(myArtSplit(line(qty, next)).base).toBe(2);
  });
});

describe("visibleGroupBuyLines", () => {
  const row = (card_id: string, total_qty: number, excluded: boolean) => ({
    card_id,
    total_qty,
    my_qty: excluded ? 0 : total_qty,
    my_is_custom: excluded,
    my_excluded: excluded,
  });
  const lines = [row("OP01-001", 0, true), row("OP01-002", 0, true), row("OP01-003", 2, false)];

  it("A card you just set to 0 on the art tiles stays on the page so you can pick an alt (#868)", () => {
    const shown = visibleGroupBuyLines(lines, { showExcluded: false, keepVisible: new Set(["OP01-001"]) });
    expect(shown.map((l) => l.card_id)).toEqual(["OP01-001", "OP01-003"]);
  });

  it("hides excluded cards nobody needs unless shown or kept (#868)", () => {
    expect(
      visibleGroupBuyLines(lines, { showExcluded: false, keepVisible: new Set() }).map((l) => l.card_id),
    ).toEqual(["OP01-003"]);
    expect(
      visibleGroupBuyLines(lines, { showExcluded: true, keepVisible: new Set() }).map((l) => l.card_id),
    ).toEqual(["OP01-001", "OP01-002", "OP01-003"]);
  });
});
