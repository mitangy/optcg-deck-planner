/**
 * Group buy detail (/group-buys/:id): the Sort menu's Price orders cards by the
 * price shown under each card (your total across picked arts), not the base
 * card price (#876).
 */
import { expect, test } from "./fixtures";

const GB = 9;
const SHOTS = process.env.PR_SHOTS_DIR;

type Spec = { id: string; name: string; base: number; qty: number; manga: number };

function line(s: Spec, n: number) {
  const img = `https://tcgplayer-cdn.tcgplayer.com/product/${n}_200w.jpg`;
  return {
    card_id: s.id,
    name: s.name,
    color: "Red",
    rarity: "SR",
    card_type: "Character",
    cost: "5",
    total_qty: s.qty,
    market_price: s.base,
    remaining_cost: s.qty * s.base,
    product_id: n,
    preferred_product_id: n,
    preferred_market_price: s.base,
    tcgplayer_url: "",
    image_url: img,
    base_image_url: img,
    members: [{ user_id: 1, display_name: "Nami", qty: s.qty }],
    alt_arts: [
      { product_id: n + 100, name: "Manga", market_price: 9, low_price: 8, image_url: img, tcgplayer_url: "", group_name: "Test", is_special: true, wanted: s.manga, owned: 0 },
    ],
    my_qty: s.qty,
    my_suggested_qty: s.qty,
    my_is_custom: false,
    my_need: s.qty,
  };
}

// OP01-001 has the higher base price ($4) but the lower total ($4); OP01-002 has the
// lower base price ($1) but the higher picked-arts total (2 x $1 + 1 x $9 = $11).
const CHEAP_BASE_HIGH_TOTAL: Spec = { id: "OP01-002", name: "Usopp", base: 1, qty: 3, manga: 1 };
const HIGH_BASE_LOW_TOTAL: Spec = { id: "OP01-001", name: "Zoro", base: 4, qty: 1, manga: 0 };

function detail() {
  const lines = [line(HIGH_BASE_LOW_TOTAL, 11), line(CHEAP_BASE_HIGH_TOTAL, 21)];
  const remaining = 4 + 11;
  return {
    id: GB,
    title: "Price sort",
    status: "open",
    invite_token: "gb-invite-876",
    invite_path: "/group-buy/join/gb-invite-876",
    host_user_id: 1,
    host_name: "Nami",
    member_count: 1,
    is_host: true,
    is_public: false,
    public_path: null,
    unique_cards: 2,
    cards_still_needed: 4,
    remaining_market: remaining,
    created_at: "2026-01-10T12:00:00Z",
    members: [
      { user_id: 1, display_name: "Nami", role: "host", deck_ids: null, cards_still_needed: 4, remaining_market: remaining, card_cost: remaining, shipping_share: 0, tax_share: 0, total_owed: remaining },
    ],
    lines,
    locked_at: null,
    ordered_at: null,
    external_order_id: "",
    order_notes: "",
    shipping_cost: 0,
    shipping_split: "equal",
    tax_cost: 0,
    cards_subtotal: remaining,
    grand_total: remaining,
    receipt_text: "",
    has_receipt: false,
    can_undo_purchase: false,
  };
}

test("Price sort orders group buy cards by the total shown under each card (#876)", async ({ page, planner }, testInfo) => {
  await page.route(`**/api/group-buys/${GB}`, (route) => route.fulfill({ json: detail() }));
  await planner.open(`/group-buys/${GB}`);
  await expect(page.getByRole("heading", { name: "Price sort", level: 1 })).toBeVisible();
  await page.getByRole("group", { name: "Card layout" }).getByRole("button", { name: "Grid", exact: true }).click();
  const cards = page.locator(".grid-card");
  await expect(cards).toHaveCount(2);
  // The price under each card is the total across the picked arts, or the unit price when none are bought.
  await expect(cards.filter({ hasText: "OP01-002" }).getByTestId("gb-arts-total")).toContainText("$11.00");
  await expect(cards.filter({ hasText: "OP01-001" }).getByTestId("gb-arts-total")).toContainText("$4.00");

  const filters = page.getByRole("button", { name: /^Filters/ });
  if (!(await page.getByRole("button", { name: /^Sort:/ }).isVisible())) await filters.click();
  await page.getByRole("button", { name: /^Sort:/ }).click();
  const panel = page.getByRole("dialog", { name: "Sort order" });
  await panel.getByLabel("Price").check();
  const up = panel.getByRole("button", { name: "Move Price up" });
  while (await up.isEnabled()) await up.click();
  await page.getByRole("button", { name: /^Sort:/ }).click();
  await expect(panel).toHaveCount(0);

  // Highest first: OP01-002 ($11 picked total, $1 base) ahead of OP01-001 ($4 total, $4 base).
  await expect(cards.first()).toContainText("OP01-002");
  await expect(cards.nth(1)).toContainText("OP01-001");
  if (SHOTS) await page.screenshot({ path: `${SHOTS}/${testInfo.project.name}-price-sort-total.png`, fullPage: true });
});

test.afterEach(({ planner }) => {
  expect(planner.errors).toEqual([]);
});
