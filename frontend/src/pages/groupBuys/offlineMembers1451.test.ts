import { describe, expect, it } from "vitest";
import type { GroupBuyLine } from "../../api";
import {
  canAddOffline,
  canMoveCopies,
  canRemoveOffline,
  hasMovableCopies,
  moveArtChoices,
  movePreview,
  moveUnitPrice,
} from "./offlineMembersModel";

const arts = (rows: [number, number | null, number][]) =>
  rows.map(([user_id, product_id, qty]) => ({ user_id, product_id, qty, qty_arrived: 0 }));

describe("adding people who are not on the app after ordering, and moving copies to them (#1451)", () => {
  it("the host adds or renames them at any status, completed included (#1451)", () => {
    for (const status of ["open", "locked", "ordered", "completed"]) expect(canAddOffline({ is_host: true, status })).toBe(true);
    expect(canAddOffline({ is_host: false, status: "ordered" })).toBe(false);
  });

  it("once locked, only someone with no copies can be removed (#1451)", () => {
    const ordered = { is_host: true, status: "ordered" };
    expect(canRemoveOffline(ordered, { cards_still_needed: 0 })).toBe(true);
    expect(canRemoveOffline(ordered, { cards_still_needed: 2 })).toBe(false);
    expect(canRemoveOffline({ is_host: true, status: "open" }, { cards_still_needed: 2 })).toBe(true);
    expect(canRemoveOffline({ is_host: true, status: "completed" }, { cards_still_needed: 2 })).toBe(false);
  });

  it("Move copies is offered to the host once locked, ordered or completed, and only with someone not on the app (#1451)", () => {
    const members = [{ is_offline: false }, { is_offline: true }];
    expect(canMoveCopies({ is_host: true, status: "locked", members })).toBe(true);
    expect(canMoveCopies({ is_host: true, status: "ordered", members })).toBe(true);
    expect(canMoveCopies({ is_host: true, status: "open", members })).toBe(false);
    expect(canMoveCopies({ is_host: true, status: "completed", members })).toBe(true);
    expect(canMoveCopies({ is_host: false, status: "ordered", members })).toBe(false);
    expect(canMoveCopies({ is_host: true, status: "ordered", members: [{ is_offline: false }] })).toBe(false);
  });

  it("the arts a member can move are their own, standard art first, with the most they can move of each (#1451)", () => {
    const line = { member_arts: arts([[1, 1009, 1], [2, null, 5], [1, null, 3], [1, 1010, 0]]) };
    expect(moveArtChoices(line, 1)).toEqual([
      { product_id: null, qty: 3 },
      { product_id: 1009, qty: 1 },
    ]);
    expect(moveArtChoices(line, 9)).toEqual([]);
    expect(hasMovableCopies(line)).toBe(true);
    expect(hasMovableCopies({ member_arts: arts([[1, null, 0]]) })).toBe(false);
    expect(hasMovableCopies({})).toBe(false);
  });

  it("a copy is priced at what was paid for that art, else that art's market price (#1451)", () => {
    const line: Pick<GroupBuyLine, "bought_arts" | "alt_arts" | "preferred_market_price" | "market_price"> = {
      bought_arts: [{ product_id: 1009, name: "Parallel", qty: 4, my_qty: 0, unit_price: 7, paid: true }],
      alt_arts: [
        { product_id: 1009, name: "Parallel", market_price: 9, low_price: null, image_url: "", tcgplayer_url: "", group_name: "", is_special: true },
        { product_id: 1010, name: "Manga", market_price: 300, low_price: null, image_url: "", tcgplayer_url: "", group_name: "", is_special: true },
      ],
      preferred_market_price: 2.5,
      market_price: 4,
    };
    expect(moveUnitPrice(line, 1009)).toBe(7);
    expect(moveUnitPrice(line, 1010)).toBe(300);
    expect(moveUnitPrice(line, null)).toBe(2.5);
  });

  it("the preview says how many copies and how much money go from whom to whom (#1451)", () => {
    expect(movePreview(2, 2.5, "Mikosaur", "Sam")).toBe("Moves 2 copies and $5.00 from Mikosaur to Sam");
    expect(movePreview(1, 3.333, "Sam", "Mikosaur")).toBe("Moves 1 copy and $3.33 from Sam to Mikosaur");
    expect(movePreview(3, null, "Mikosaur", "Sam")).toBe("Moves 3 copies from Mikosaur to Sam");
  });
});
