import { describe, expect, it } from "vitest";
import type { OwnedCard, PrintingView } from "../../api";
import { priceCheckOwned } from "./priceCheckOwned";

const alt = (product_id: number, owned: number): PrintingView => ({
  product_id,
  name: `Alt ${product_id}`,
  market_price: 1,
  low_price: 1,
  image_url: "",
  tcgplayer_url: "",
  group_name: "Set",
  is_special: true,
  owned,
});
const item = (card_id: string, owned: number, alt_arts: PrintingView[] = []): OwnedCard =>
  ({ card_id, name: card_id, owned, alt_arts, alts_owned: alt_arts.reduce((n, a) => n + (a.owned ?? 0), 0) }) as unknown as OwnedCard;

const ITEMS = [item("OP01-001", 3, [alt(13, 5), alt(14, 2)]), item("OP01-002", 1)];

describe("Price check owned count (#1496)", () => {
  it("a base row shows the base copies, not the alts (#1496)", () => {
    expect(priceCheckOwned(ITEMS, { card_id: "OP01-001" })).toBe(3);
  });

  it("an alt row shows that alt's own copies, not the base or another alt (#1496)", () => {
    expect(priceCheckOwned(ITEMS, { card_id: "OP01-001", alt_product_id: 13 })).toBe(5);
    expect(priceCheckOwned(ITEMS, { card_id: "OP01-001", alt_product_id: 14 })).toBe(2);
  });

  it("a card or alt that is not in the collection is 0 (#1496)", () => {
    expect(priceCheckOwned(ITEMS, { card_id: "OP09-001" })).toBe(0);
    expect(priceCheckOwned(ITEMS, { card_id: "OP01-002", alt_product_id: 99 })).toBe(0);
  });

  it("matches the card id whatever its case (#1496)", () => {
    expect(priceCheckOwned(ITEMS, { card_id: "op01-001" })).toBe(3);
  });
});
