import { expect, test } from "./fixtures";

const GB = 51;
const IMG = (n: number) => `https://tcgplayer-cdn.tcgplayer.com/product/${n}_200w.jpg`;

function line(card_id: string, name: string, pid: number, over: Record<string, unknown>) {
  return {
    card_id, name, color: "Red", rarity: "R", card_type: "Character", cost: "3", total_qty: 3, market_price: 1.5, remaining_cost: 4.5,
    product_id: pid, preferred_product_id: pid, preferred_market_price: 1.5, tcgplayer_url: "", image_url: IMG(pid), base_image_url: IMG(pid),
    members: [{ user_id: 1, display_name: "Nami", qty: 2 }, { user_id: 2, display_name: "Zoro", qty: 1 }],
    alt_arts: [{ product_id: pid + 1, name: "Parallel", image_url: IMG(pid + 1), market_price: 9, wanted: 1, owned: 0 }], art_wants: [],
    my_qty: 2, my_suggested_qty: 2, my_is_custom: false, my_need: 2, in_order: 0, arrived: 0, not_ordered: 0, my_in_order: 0, my_arrived: 0, my_not_ordered: 0,
    ...over,
  };
}

const detail = {
  id: GB, title: "Friday pool", status: "ordered", invite_token: "t1439", invite_path: "/group-buy/join/t1439", host_user_id: 1, host_name: "Nami",
  member_count: 2, is_host: true, is_public: false, public_path: null, unique_cards: 2, cards_still_needed: 6, remaining_market: 9, created_at: "2026-01-10T12:00:00Z",
  members: [
    { user_id: 1, display_name: "Nami", role: "host", deck_ids: null, include_singles: true, include_extra_copies: false, cards_still_needed: 4, remaining_market: 6, card_cost: 6, shipping_share: 0, tax_share: 0, total_owed: 6 },
    { user_id: 2, display_name: "Zoro", role: "member", deck_ids: null, include_singles: true, include_extra_copies: false, cards_still_needed: 2, remaining_market: 3, card_cost: 3, shipping_share: 0, tax_share: 0, total_owed: 3 },
  ],
  lines: [
    line("OP01-001", "Luffy", 701, {
      in_order: 1, not_ordered: 2,
      not_ordered_members: [{ user_id: 1, display_name: "Nami", qty: 1, product_id: null }, { user_id: 2, display_name: "Zoro", qty: 1, product_id: 702 }],
    }),
    line("OP01-002", "Zoro Card", 801, { in_order: 3, not_ordered: 0, not_ordered_members: [] }),
  ],
  locked_at: "2026-01-11T12:00:00Z", ordered_at: "2026-01-12T12:00:00Z", external_order_id: "", order_notes: "", shipping_cost: 0, shipping_split: "equal", tax_cost: 0,
  cards_subtotal: 9, grand_total: 9, receipt_text: "", has_receipt: false, can_undo_purchase: false,
  orders: [{
    id: 5, seller_name: "Grand Line", status: "on_the_way", qty_ordered: 4, qty_allocated: 4, qty_arrived: 0, qty_extra: 0, arrived_at: null,
    created_at: "2026-01-12T12:00:00Z", version: 1, order_number: "ABCDE-12345", tracking_url: "", receipt_text: "",
    lines: [{ id: 5, card_id: "OP01-002", name: "Zoro Card", product_id: null, qty_ordered: 4, qty_arrived: 0, qty_extra: 0, allocations: [{ user_id: 1, display_name: "Nami", qty: 4, qty_arrived: 0 }] }],
  }],
};

test("The progress line links to the cards that are not in an order, and says who each is for (#1439)", async ({ page, planner }) => {
  await page.route(`**/api/group-buys/${GB}`, (r) => r.fulfill({ json: detail }));
  await planner.open(`/group-buys/${GB}`);

  const panel = page.getByTestId("gb-not-ordered");
  await page.getByTestId("gb-not-ordered-link").click();
  await expect(panel.getByRole("heading", { name: /Not in an order yet \(2 copies\)/ })).toBeFocused();
  const rows = panel.getByTestId("gb-not-ordered-list").getByRole("listitem");
  await expect(rows).toHaveCount(1);
  await expect(rows.first()).toContainText("Luffy");
  await expect(rows.first()).toContainText("Nami ×1 (Base) · Zoro ×1 (Parallel)");
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
});
