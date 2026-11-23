import { mkdirSync } from "node:fs";
import { expect, test } from "./fixtures";

const GB = 41;
const SHOTS = process.env.PR_SHOTS_DIR;
test.use({ deviceScaleFactor: SHOTS ? 2 : 1 });

const IMG = (n: number) => `https://tcgplayer-cdn.tcgplayer.com/product/${n}_200w.jpg`;
const A = "8F3A21C0-77C1A0-1B3E4";
const B = "0C4D5E6F-A1B2C3-D4E5F";
const C = "FFEEDDCC-BBAA99-88776";
const D = "1234ABCD-9F8E7D-6C5B4";

const PAGE = `Order History\nORDER DATE\nNovember 20, 2026\nORDER NUMBER\n${A}\nITEMS DETAILS PRICE QUANTITY\nMonkey D. Luffy (001)\nTest Set\nRarity: R\nCondition: Near Mint $2.50 3\n`;
const PDF_TEXT = `${PAGE}ORDER DATE\nNovember 18, 2026\nORDER NUMBER\n${D}\n`;

const luffy = (qty: number) => ({
  card_id: "OP01-001", name: "Luffy", product_id: null, qty, allocations: [{ user_id: 1, display_name: "Nami", qty }], qty_extra: 0,
});
const order = (number: string, over: Record<string, unknown> = {}) => ({
  order_number: number, order_date: "November 20, 2026", seller_name: "Grand Line Singles", tracking_number: "", tracking_url: "",
  already_added: false, in_group_buy: true, lines: [luffy(3)], unmatched: [], ...over,
});
const PREVIEW = {
  text: "",
  orders: [
    order(A, { tracking_number: "1Z999AA10123456784", tracking_url: "https://www.ups.com/track?tracknum=1Z999AA10123456784" }),
    order(B, { seller_name: "Thousand Sunny Cards", already_added: true }),
    order(C, { seller_name: "Merry Go Marketplace", in_group_buy: false, lines: [{ ...luffy(4), card_id: "OP01-016", name: "Nami", allocations: [], qty_extra: 4 }] }),
    order(D, {
      seller_name: "A Seller With A Rather Long Marketplace Name Of Their Own", order_date: "November 18, 2026",
      tracking_number: "9400100000000000000042", tracking_url: "https://tools.usps.com/go/TrackConfirmAction?tLabels=9400100000000000000042",
      lines: [luffy(1)], unmatched: [{ qty: 1, description: "Mystery Promo Card", set_name: "Some Promo Set", card_name: "Mystery Promo Card" }],
    }),
  ],
};

function detail(added: number) {
  const line = {
    card_id: "OP01-001", name: "Luffy", color: "Red", rarity: "R", card_type: "Character", cost: "3", total_qty: 4, market_price: 1.5, remaining_cost: 6,
    product_id: 701, preferred_product_id: 701, preferred_market_price: 1.5, tcgplayer_url: "", image_url: IMG(701), base_image_url: IMG(701),
    members: [{ user_id: 1, display_name: "Nami", qty: 4 }], alt_arts: [], art_wants: [], my_qty: 4, my_suggested_qty: 4, my_is_custom: false, my_need: 4,
    in_order: added ? 4 : 0, arrived: 0, not_ordered: added ? 0 : 4, my_in_order: added ? 4 : 0, my_arrived: 0, my_not_ordered: added ? 0 : 4,
  };
  const orders = Array.from({ length: added }, (_, i) => ({
    id: 10 + i, seller_name: i ? "A Seller With A Rather Long Marketplace Name Of Their Own" : "Grand Line Singles", status: "on_the_way", qty_ordered: 3, qty_allocated: 3, qty_arrived: 0, qty_extra: 0,
    arrived_at: null, created_at: "2026-01-12T12:00:00Z", version: 1, order_number: i ? D : A, tracking_url: "", receipt_text: "",
    lines: [{ id: 5 + i, card_id: "OP01-001", name: "Luffy", product_id: null, qty_ordered: 3, qty_arrived: 0, qty_extra: 0, allocations: [{ user_id: 1, display_name: "Nami", qty: 3, qty_arrived: 0 }] }],
  }));
  return {
    id: GB, title: "Friday pool", status: added ? "ordered" : "locked", invite_token: "t1433", invite_path: "/group-buy/join/t1433", host_user_id: 1, host_name: "Nami",
    member_count: 1, is_host: true, is_public: false, public_path: null, unique_cards: 1, cards_still_needed: 4, remaining_market: 6, created_at: "2026-01-10T12:00:00Z",
    members: [{ user_id: 1, display_name: "Nami", role: "host", deck_ids: null, include_singles: true, include_extra_copies: false, cards_still_needed: 4, remaining_market: 6, card_cost: 6, shipping_share: 0, tax_share: 0, total_owed: 6 }],
    lines: [line], locked_at: "2026-01-11T12:00:00Z", ordered_at: added ? "2026-01-12T12:00:00Z" : null,
    external_order_id: "", order_notes: "", shipping_cost: 0, shipping_split: "equal", tax_cost: 0, cards_subtotal: 6, grand_total: 6,
    receipt_text: "", has_receipt: false, can_undo_purchase: false, orders,
  };
}

async function shot(page: import("@playwright/test").Page, name: string, project: string) {
  if (!SHOTS) return;
  mkdirSync(SHOTS, { recursive: true });
  await page.screenshot({ path: `${SHOTS}/${name}-${project}.png` });
}

test("Host pastes the whole Order History page and adds the chosen orders at once (#1433)", async ({ page, planner }, testInfo) => {
  let added = 0;
  const imported: unknown[] = [];
  await page.route(`**/api/group-buys/${GB}`, (r) => r.fulfill({ json: detail(added) }));
  await page.route(`**/api/group-buys/${GB}/orders/history/preview`, (r) => r.fulfill({ json: PREVIEW }));
  await page.route(`**/api/group-buys/${GB}/orders/history/import`, (r) => {
    imported.push(r.request().postDataJSON());
    added = 2;
    return r.fulfill({ json: { order_ids: [10, 11], unmatched: [{ qty: 1, description: "Mystery Promo Card", set_name: "", card_name: "Mystery Promo Card" }], detail: detail(2) } });
  });

  await planner.open(`/group-buys/${GB}`);
  await page.getByTestId("gb-add-order").click();
  const dialog = page.getByRole("dialog");
  await expect(dialog.getByText("Paste one order's items, or your whole Order History page")).toBeVisible();
  await dialog.locator("textarea").fill(PAGE);

  await expect(dialog.getByRole("heading", { name: "Found 4 orders, 2 selected" })).toBeVisible();
  const cards = dialog.getByTestId("gb-history-order");
  await expect(cards).toHaveCount(4);
  await expect(cards.nth(0)).toContainText("Grand Line Singles");
  await expect(cards.nth(0).getByRole("link", { name: "Track 1Z999AA10123456784" })).toHaveAttribute("href", /ups\.com/);
  await expect(cards.nth(0)).toContainText("Nami ×3");
  await expect(cards.nth(1)).toContainText("Already added");
  await expect(cards.nth(1).getByRole("checkbox")).toBeDisabled();
  await expect(cards.nth(1).getByRole("checkbox")).not.toBeChecked();
  await expect(cards.nth(2)).toContainText("No cards from this group buy");
  await expect(cards.nth(2).getByRole("checkbox")).not.toBeChecked();
  await expect(cards.nth(3)).toContainText("Not in this buy");
  await expect(dialog.getByRole("button", { name: "Add 2 orders" })).toBeEnabled();
  await shot(page, "order-history-list", testInfo.project.name);

  // Nothing sideways, and the dialog (not the page) is what scrolls.
  expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)).toBeLessThanOrEqual(0);
  const overflow = await dialog.evaluate((el) => Math.max(...[...el.querySelectorAll("*")].map((n) => n.getBoundingClientRect().right - el.getBoundingClientRect().right)));
  expect(overflow).toBeLessThanOrEqual(1);

  await cards.nth(3).getByRole("checkbox").uncheck();
  await expect(dialog.getByRole("heading", { name: "Found 4 orders, 1 selected" })).toBeVisible();
  await expect(dialog.getByRole("button", { name: "Add 1 order" })).toBeEnabled();
  await cards.nth(2).getByRole("checkbox").check();
  await cards.nth(3).getByRole("checkbox").check();
  await expect(dialog.getByRole("button", { name: "Add 3 orders" })).toBeEnabled();
  await cards.nth(2).getByRole("checkbox").uncheck();

  await dialog.getByRole("button", { name: "Add 2 orders" }).click();
  await expect(page.getByTestId("gb-order")).toHaveCount(2);
  await expect(page.getByText("2 orders added")).toBeVisible();
  expect(imported).toEqual([{ text: PAGE, order_numbers: [A, D] }]);
});

test("Host uploads the Order History saved as PDF and gets the same list (#1433)", async ({ page, planner }) => {
  const imported: unknown[] = [];
  let pdfUploads = 0;
  await page.route(`**/api/group-buys/${GB}`, (r) => r.fulfill({ json: detail(0) }));
  await page.route(`**/api/group-buys/${GB}/orders/history/pdf`, (r) => {
    pdfUploads += 1;
    expect(r.request().headers()["content-type"]).toContain("multipart/form-data");
    return r.fulfill({ json: { ...PREVIEW, text: PDF_TEXT } });
  });
  await page.route(`**/api/group-buys/${GB}/orders/history/import`, (r) => {
    imported.push(r.request().postDataJSON());
    return r.fulfill({ json: { order_ids: [10, 11], unmatched: [], detail: detail(2) } });
  });

  await planner.open(`/group-buys/${GB}`);
  await page.getByTestId("gb-add-order").click();
  const dialog = page.getByRole("dialog");
  await expect(dialog.getByText("Saved the Order History page as a PDF? Upload it.")).toBeVisible();
  await dialog.getByLabel("Order History PDF").setInputFiles({ name: "orders.pdf", mimeType: "application/pdf", buffer: Buffer.from("%PDF-1.7 test") });

  await expect(dialog.getByRole("heading", { name: "Found 4 orders, 2 selected" })).toBeVisible();
  await expect(dialog.getByText("Read orders.pdf")).toBeVisible();
  expect(pdfUploads).toBe(1);
  await dialog.getByRole("button", { name: "Add 2 orders" }).click();
  await expect(page.getByTestId("gb-order")).toHaveCount(2);
  expect(imported).toEqual([{ text: PDF_TEXT, order_numbers: [A, D] }]);
});

test("A PDF the server cannot read says so and keeps the dialog usable (#1433)", async ({ page, planner }) => {
  await page.route(`**/api/group-buys/${GB}`, (r) => r.fulfill({ json: detail(0) }));
  await page.route(`**/api/group-buys/${GB}/orders/history/pdf`, (r) => r.fulfill({ status: 400, json: { detail: "Couldn't read that PDF" } }));
  await planner.open(`/group-buys/${GB}`);
  await page.getByTestId("gb-add-order").click();
  const dialog = page.getByRole("dialog");
  await dialog.getByLabel("Order History PDF").setInputFiles({ name: "orders.pdf", mimeType: "application/pdf", buffer: Buffer.from("%PDF-1.7 bad") });

  await expect(dialog.getByRole("alert").filter({ hasText: "Couldn't read that PDF" })).toBeVisible();
  await expect(dialog.getByRole("button", { name: "Upload PDF" })).toBeEnabled();
  await expect(dialog.locator("textarea")).toBeVisible();
});

test.afterEach(({ planner }) => {
  expect(planner.errors).toEqual([]);
});
