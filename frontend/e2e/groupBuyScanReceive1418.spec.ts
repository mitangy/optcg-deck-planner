import { expect, test } from "./fixtures";

const GB = 41;
const IMG = (n: number) => `https://tcgplayer-cdn.tcgplayer.com/product/${n}_200w.jpg`;

const oline = (id: number, cardId: string, name: string, qty: number) => ({
  id, card_id: cardId, name, product_id: null, qty_ordered: qty, qty_arrived: 0, qty_extra: 0,
  allocations: [{ user_id: 1, display_name: "Nami", qty, qty_arrived: 0 }],
});
const order = (id: number, seller: string, lines: ReturnType<typeof oline>[]) => ({
  id, seller_name: seller, status: "on_the_way", qty_ordered: 3, qty_allocated: 3, qty_arrived: 0, qty_extra: 0, arrived_at: null,
  created_at: "2026-01-12T12:00:00Z", version: 1, order_number: "", tracking_url: "", receipt_text: "", lines,
});
const gline = (cardId: string, name: string, productId: number) => ({
  card_id: cardId, name, color: "Red", rarity: "R", card_type: "Character", cost: "3", total_qty: 2, market_price: 1.5, remaining_cost: 3,
  product_id: productId, preferred_product_id: productId, preferred_market_price: 1.5, tcgplayer_url: "", image_url: IMG(productId), base_image_url: IMG(productId),
  members: [{ user_id: 1, display_name: "Nami", qty: 2 }], alt_arts: [], art_wants: [], my_qty: 2, my_suggested_qty: 2, my_is_custom: false, my_need: 2,
  in_order: 2, arrived: 0, not_ordered: 0, my_in_order: 2, my_arrived: 0, my_not_ordered: 0,
});

const detail = {
  id: GB, title: "Friday pool", status: "ordered", invite_token: "t1418", invite_path: "/group-buy/join/t1418", host_user_id: 1, host_name: "Nami",
  member_count: 1, is_host: true, is_public: false, public_path: null, unique_cards: 2, cards_still_needed: 4, remaining_market: 6, created_at: "2026-01-10T12:00:00Z",
  members: [{ user_id: 1, display_name: "Nami", role: "host", deck_ids: null, include_singles: true, include_extra_copies: false, cards_still_needed: 4, remaining_market: 6, card_cost: 6, shipping_share: 0, tax_share: 0, total_owed: 6 }],
  lines: [gline("OP01-001", "Luffy", 701), gline("OP02-002", "Ace", 702)], locked_at: "2026-01-11T12:00:00Z", ordered_at: "2026-01-12T12:00:00Z",
  external_order_id: "", order_notes: "", shipping_cost: 0, shipping_split: "equal", tax_cost: 0, cards_subtotal: 6, grand_total: 6, receipt_text: "", has_receipt: false, can_undo_purchase: false,
  orders: [
    { ...order(5, "Grand Line", [oline(5, "OP01-001", "Luffy", 2)]), qty_ordered: 2, qty_allocated: 2 },
    { ...order(6, "Sabaody", [oline(6, "OP02-002", "Ace", 2)]), qty_ordered: 2, qty_allocated: 2 },
  ],
};

test("Scan cards fills Check items, lists extras with the other order, and saves only on Save (#1418)", async ({ page, planner }) => {
  const puts: unknown[] = [];
  await page.route(`**/api/group-buys/${GB}`, (r) => r.fulfill({ json: detail }));
  await page.route(`**/api/group-buys/${GB}/orders/5/arrival`, (r) => {
    puts.push(r.request().postDataJSON());
    return r.fulfill({ json: detail });
  });
  await planner.open(`/group-buys/${GB}`);
  await page.evaluate(() => {
    const quad = [{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 1, y: 1 }, { x: 0, y: 1 }];
    const item = (cardId: string) => ({ quad, thumbUrl: "", cardId, inliers: 40, runnerUp: 5, confidence: "sure" });
    (window as unknown as Record<string, unknown>).__optcgTestMatchAll = async () => [item("OP01-001"), item("OP01-001"), item("OP01-001"), item("OP02-002")];
  });
  await page.getByTestId("gb-order").first().getByRole("button", { name: "Scan cards" }).click();
  const scanner = page.getByRole("dialog", { name: "Scan cards" });
  const png = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==", "base64");
  await scanner.locator('input[type="file"]').last().setInputFiles({ name: "cards.png", mimeType: "image/png", buffer: png });
  await expect(scanner.getByRole("status")).toHaveText("2 counted · 2 not in this order");
  expect(puts).toEqual([]);
  await scanner.getByRole("button", { name: "Back to Check items" }).click();

  const check = page.getByRole("dialog", { name: "Check items" });
  await expect(check.getByLabel("2 of 2 arrived")).toBeVisible();
  const extra = check.getByTestId("gb-scan-extra");
  await expect(extra).toContainText("1 × Luffy");
  await expect(extra).toContainText("1 × Ace");
  await expect(extra).toContainText("In Sabaody order");
  await check.getByRole("button", { name: "Save · 2 of 2 arrived" }).click();
  await expect.poll(() => puts).toEqual([{ expected_version: 1, lines: [{ line_id: 5, qty_arrived: 2 }] }]);
});

test.afterEach(({ planner }) => {
  expect(planner.errors).toEqual([]);
});
