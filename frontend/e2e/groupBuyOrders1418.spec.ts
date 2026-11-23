import { expect, test } from "./fixtures";

const GB = 41;
const IMG = (n: number) => `https://tcgplayer-cdn.tcgplayer.com/product/${n}_200w.jpg`;

type Order = { id: number; seller: string; number: string; arrived: boolean };

function detail(orders: Order[]) {
  const ordered = orders.length > 0;
  const arrived = orders.some((o) => o.arrived) ? 3 : 0;
  const line = {
    card_id: "OP01-001", name: "Luffy", color: "Red", rarity: "R", card_type: "Character", cost: "3", total_qty: 3, market_price: 1.5, remaining_cost: 4.5,
    product_id: 701, preferred_product_id: 701, preferred_market_price: 1.5, tcgplayer_url: "", image_url: IMG(701), base_image_url: IMG(701),
    members: [{ user_id: 1, display_name: "Nami", qty: 3 }], alt_arts: [], art_wants: [], my_qty: 3, my_suggested_qty: 3, my_is_custom: false, my_need: 3,
    in_order: ordered ? 3 : 0, arrived, not_ordered: ordered ? 0 : 3, my_in_order: ordered ? 3 : 0, my_arrived: arrived, my_not_ordered: ordered ? 0 : 3,
  };
  return {
    id: GB, title: "Friday pool", status: !ordered ? "locked" : arrived ? "completed" : "ordered", invite_token: "t1418", invite_path: "/group-buy/join/t1418", host_user_id: 1, host_name: "Nami",
    member_count: 1, is_host: true, is_public: false, public_path: null, unique_cards: 1, cards_still_needed: 3, remaining_market: 4.5, created_at: "2026-01-10T12:00:00Z",
    members: [{ user_id: 1, display_name: "Nami", role: "host", deck_ids: null, include_singles: true, include_extra_copies: false, cards_still_needed: 3, remaining_market: 4.5, card_cost: 4.5, shipping_share: 0, tax_share: 0, total_owed: 4.5 }],
    lines: [line], locked_at: "2026-01-11T12:00:00Z", ordered_at: ordered ? "2026-01-12T12:00:00Z" : null,
    external_order_id: "", order_notes: "", shipping_cost: 0, shipping_split: "equal", tax_cost: 0, cards_subtotal: 4.5, grand_total: 4.5,
    receipt_text: "", has_receipt: false, can_undo_purchase: false,
    orders: orders.map((o) => ({
      id: o.id, seller_name: o.seller, status: o.arrived ? "arrived" : "on_the_way", qty_ordered: 3, qty_allocated: 3, qty_arrived: o.arrived ? 3 : 0, qty_extra: 0, arrived_at: null,
      created_at: "2026-01-12T12:00:00Z", version: o.arrived ? 2 : 1, order_number: o.number, tracking_url: "", receipt_text: "",
      lines: [{ id: 5, card_id: "OP01-001", name: "Luffy", product_id: null, qty_ordered: 3, qty_arrived: o.arrived ? 3 : 0, qty_extra: 0, allocations: [{ user_id: 1, display_name: "Nami", qty: 3, qty_arrived: o.arrived ? 3 : 0 }] }],
    })),
  };
}

test("Host adds a pasted order, sees the match first, then marks the package arrived (#1418)", async ({ page, planner }) => {
  const orders: Order[] = [];
  const posted: unknown[] = [];
  await page.route(`**/api/group-buys/${GB}`, (r) => r.fulfill({ json: detail(orders) }));
  await page.route(`**/api/group-buys/${GB}/orders/preview`, (r) =>
    r.fulfill({
      json: {
        lines: [{ card_id: "OP01-001", name: "Luffy", product_id: null, qty: 3, allocations: [{ user_id: 1, display_name: "Nami", qty: 3 }], qty_extra: 0 }],
        unmatched: [{ qty: 1, description: "Mystery Card", set_name: "", card_name: "Mystery Card" }],
      },
    }),
  );
  await page.route(`**/api/group-buys/${GB}/orders`, (r) => {
    posted.push(r.request().postDataJSON());
    orders.push({ id: 5, seller: "Grand Line", number: "ABCDE-12345", arrived: false });
    return r.fulfill({ json: { order_id: 5, unmatched: [], detail: detail(orders) } });
  });
  await page.route(`**/api/group-buys/${GB}/orders/5/arrival`, (r) => {
    orders[0].arrived = true;
    return r.fulfill({ json: detail(orders) });
  });

  await planner.open(`/group-buys/${GB}`);
  await expect(page.getByText("Checked out on TCGplayer? Add each seller's order from Order History.")).toBeVisible();
  await page.getByTestId("gb-add-order").click();
  const dialog = page.getByRole("dialog", { name: /Add a TCGplayer order/ });
  await dialog.getByLabel("Order number").fill("ABCDE-12345");
  await dialog.getByLabel(/^Seller/).fill("Grand Line");
  await dialog.locator("textarea").fill("Qty\tDescription\n3\tLuffy\n1\tMystery Card");
  await expect(dialog.getByTestId("gb-order-preview")).toContainText("3 copies matched");
  await expect(dialog.getByTestId("gb-order-preview")).toContainText("Not in this buy");
  await dialog.getByRole("button", { name: "Save order · 3 copies" }).click();

  const card = page.getByTestId("gb-order");
  await expect(card).toContainText("Grand Line");
  await expect(card).toContainText("…12345");
  await expect(card).toContainText("On the way");
  expect(posted).toEqual([{ order_number: "ABCDE-12345", seller_name: "Grand Line", tracking_url: "", mark_arrived: false, receipt_text: "Qty\tDescription\n3\tLuffy\n1\tMystery Card" }]);

  await card.getByRole("button", { name: "Mark arrived" }).click();
  await expect(card).toContainText("Arrived");
  await expect(page.getByTestId("gb-packages")).toContainText("3 arrived");
});

test("An order saved without items gets them later through Add items (#1418)", async ({ page, planner }) => {
  const empty = detail([{ id: 5, seller: "Grand Line", number: "ABCDE-12345", arrived: false }]);
  empty.orders[0].lines = [];
  empty.orders[0].qty_ordered = 0;
  let full = false;
  const puts: unknown[] = [];
  await page.route(`**/api/group-buys/${GB}`, (r) => r.fulfill({ json: full ? detail([{ id: 5, seller: "Grand Line", number: "ABCDE-12345", arrived: false }]) : empty }));
  await page.route(`**/api/group-buys/${GB}/orders/5/lines`, (r) => {
    puts.push(r.request().postDataJSON());
    full = true;
    return r.fulfill({ json: { order_id: 5, unmatched: [], detail: detail([{ id: 5, seller: "Grand Line", number: "ABCDE-12345", arrived: false }]) } });
  });
  await planner.open(`/group-buys/${GB}`);
  const card = page.getByTestId("gb-order");
  await expect(card).toContainText("No cards in this order yet");
  await card.getByRole("button", { name: "Add items" }).click();
  const dialog = page.getByRole("dialog", { name: /Edit order/ });
  await expect(dialog.getByLabel("Order number")).toHaveValue("ABCDE-12345");
  await dialog.locator("textarea").fill("Qty\tDescription\n3\tLuffy");
  await dialog.getByRole("button", { name: /^Save changes/ }).click();
  await expect(card).toContainText("0 of 3 copies arrived");
  expect(puts).toEqual([{ expected_version: 1, receipt_text: "Qty\tDescription\n3\tLuffy" }]);
});

test("A member sees one line per package and no host buttons, and nothing scrolls sideways at 375px (#1418)", async ({ page, planner }, testInfo) => {
  test.skip(testInfo.project.name !== "desktop-1200", "sets its own viewport");
  await page.setViewportSize({ width: 375, height: 812 });
  const d = { ...detail([{ id: 5, seller: "Grand Line Singles With A Rather Long Name", number: "", arrived: false }]), is_host: false };
  await page.route(`**/api/group-buys/${GB}`, (r) => r.fulfill({ json: d }));
  await planner.open(`/group-buys/${GB}`);
  await expect(page.getByTestId("gb-your-cards")).toContainText("On the way");
  await expect(page.getByTestId("gb-order")).toContainText("Grand Line Singles With A Rather Long Name");
  await expect(page.getByRole("button", { name: "Mark arrived" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Add order" })).toHaveCount(0);
  expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)).toBeLessThanOrEqual(0);
  const overflow = await page.evaluate(() =>
    Math.max(...[...document.querySelectorAll("[data-testid=gb-packages] *, [data-testid=gb-your-cards] *")].map((el) => el.getBoundingClientRect().right - window.innerWidth)),
  );
  expect(overflow).toBeLessThanOrEqual(1);
});

test.afterEach(({ planner }) => {
  expect(planner.errors).toEqual([]);
});
