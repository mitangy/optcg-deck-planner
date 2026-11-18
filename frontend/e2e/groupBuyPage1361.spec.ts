import { expect, test } from "./fixtures";

const GB = 31;
const IMG = (n: number) => `https://tcgplayer-cdn.tcgplayer.com/product/${n}_200w.jpg`;

function line(i: number) {
  const pid = 700 + i;
  const id = `OP01-${String(i).padStart(3, "0")}`;
  return {
    card_id: id, name: `Card ${i}`, color: "Red", rarity: "R", card_type: "Character", cost: "3", total_qty: 2, market_price: 1.5, remaining_cost: 3,
    product_id: pid, preferred_product_id: pid, preferred_market_price: 1.5, tcgplayer_url: "", image_url: IMG(pid), base_image_url: IMG(pid),
    members: [{ user_id: 1, display_name: "Nami", qty: 2 }], alt_arts: [], art_wants: [], my_qty: 2, my_suggested_qty: 2, my_is_custom: false, my_need: 2,
  };
}

function detail(status: "open" | "ordered", lines = 12) {
  const ls = Array.from({ length: lines }, (_, i) => line(i + 1));
  return {
    id: GB, title: "Friday pool", status, invite_token: "t1361", invite_path: "/group-buy/join/t1361", host_user_id: 1, host_name: "Nami",
    member_count: 1, is_host: true, is_public: false, public_path: null, unique_cards: ls.length, cards_still_needed: lines * 2, remaining_market: lines * 3,
    created_at: "2026-01-10T12:00:00Z",
    members: [{ user_id: 1, display_name: "Nami", role: "host", deck_ids: null, include_singles: true, include_extra_copies: false, cards_still_needed: lines * 2, remaining_market: lines * 3, card_cost: lines * 3, shipping_share: 0, tax_share: 0, total_owed: lines * 3 }],
    lines: ls, locked_at: status === "open" ? null : "2026-01-11T12:00:00Z", ordered_at: status === "open" ? null : "2026-01-12T12:00:00Z",
    external_order_id: "", order_notes: "", shipping_cost: 0, shipping_split: "equal", tax_cost: 0, cards_subtotal: lines * 3, grand_total: lines * 3,
    receipt_text: "", has_receipt: false, can_undo_purchase: false,
  };
}

test("Host, open, at 1280x720: a card row is above the fold and Include lives in Your share, not Filters (#1361)", async ({ page, planner }, testInfo) => {
  test.skip(testInfo.project.name !== "desktop-1200", "the 1280x720 laptop check");
  planner.defaultDensity = true;
  await page.setViewportSize({ width: 1280, height: 720 });
  await page.route(`**/api/group-buys/${GB}`, (r) => r.fulfill({ json: detail("open") }));
  await planner.open(`/group-buys/${GB}`);
  await expect(page.getByRole("heading", { name: "Friday pool", level: 1 })).toBeVisible();

  const firstRow = page.locator(".data-table tbody tr").first();
  await expect(firstRow).toBeVisible();
  const top = await firstRow.evaluate((el) => el.getBoundingClientRect().top);
  expect(top).toBeLessThan(720);
  const height = await firstRow.evaluate((el) => el.getBoundingClientRect().height);
  expect(height).toBeLessThan(110);

  const share = page.getByTestId("gb-your-share");
  await share.getByRole("button", { name: "Edit" }).click();
  await expect(share.getByLabel("Cards not in a deck")).toBeVisible();
  await page.getByRole("button", { name: /^Filters/ }).click();
  await expect(page.getByLabel("Show alt arts")).toBeVisible();
  await expect(page.getByLabel("Show excluded")).toBeVisible();
  await expect(page.locator(".collection-filter-panel").getByLabel("Cards not in a deck")).toHaveCount(0);
});

test("A phone held sideways shows the card list, not a table, and the page does not scroll sideways (#1361)", async ({ page, planner }, testInfo) => {
  test.skip(testInfo.project.name !== "desktop-1200", "sets its own viewport");
  planner.defaultDensity = true;
  await page.setViewportSize({ width: 812, height: 375 });
  await page.route(`**/api/group-buys/${GB}`, (r) => r.fulfill({ json: detail("open") }));
  await planner.open(`/group-buys/${GB}`);
  await expect(page.getByRole("heading", { name: "Friday pool", level: 1 })).toBeVisible();
  await expect(page.locator(".mobile-card").first()).toBeVisible();
  await expect(page.locator(".data-table")).toHaveCount(0);
  expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)).toBeLessThanOrEqual(0);
  // The page clips sideways overflow, so also check no card runs past the screen edge (it would be cut off, not scrollable).
  const overflow = await page.evaluate(() =>
    Math.max(...[...document.querySelectorAll(".mobile-card")].map((el) => el.getBoundingClientRect().right - window.innerWidth)),
  );
  expect(overflow).toBeLessThanOrEqual(1);
});

test("An ordered group buy's main button is Import receipt and it focuses the receipt box (#1361)", async ({ page, planner }) => {
  await page.route(`**/api/group-buys/${GB}`, (r) => r.fulfill({ json: detail("ordered", 3) }));
  await planner.open(`/group-buys/${GB}`);
  await expect(page.getByRole("heading", { name: "Friday pool", level: 1 })).toBeVisible();
  // Hide the paste box first, so the button has to open it again.
  await page.getByRole("button", { name: "Hide import" }).click();
  await expect(page.getByLabel("Receipt text")).toHaveCount(0);
  const primary = page.locator(".gb-actions .btn.primary");
  await expect(primary).toHaveText("Import receipt");
  await primary.click();
  await expect(page.getByLabel("Receipt text")).toBeFocused();
});

test.afterEach(({ planner }) => {
  expect(planner.errors).toEqual([]);
});
