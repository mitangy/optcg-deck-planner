/**
 * Group buy detail (/group-buys/:id): the alt-art selector leads with the Base
 * tile, and the price under each card is the total across the arts the viewer
 * picked. Runs at desktop-1200 (grid) and phone-375 (grid and list).
 */
import { expect, test } from "./fixtures";

const GB = 7;
const BASE_PRICE = 1;
const MANGA_PRICE = 9;

/** An open group buy with one card: base art $1.00, one Manga alt $9.00 that the viewer wants once. */
function detail(myQty: number) {
  const baseCopies = Math.max(0, myQty - 1);
  const alts = Math.min(1, myQty);
  const remaining = baseCopies * BASE_PRICE + alts * MANGA_PRICE;
  return {
    id: GB,
    title: "Luffy split",
    status: "open",
    invite_token: "gb-invite",
    invite_path: "/group-buy/join/gb-invite",
    host_user_id: 1,
    host_name: "Nami",
    member_count: 1,
    is_host: true,
    is_public: false,
    public_path: null,
    unique_cards: 1,
    cards_still_needed: myQty,
    remaining_market: remaining,
    created_at: "2026-01-10T12:00:00Z",
    members: [
      { user_id: 1, display_name: "Nami", role: "host", deck_ids: null, cards_still_needed: myQty, remaining_market: remaining, card_cost: remaining, shipping_share: 0, tax_share: 0, total_owed: remaining },
    ],
    lines: [
      {
        card_id: "OP01-001",
        name: "Roronoa Zoro",
        color: "Red",
        rarity: "L",
        card_type: "Leader",
        cost: "5",
        total_qty: myQty,
        // The host's checkout printing is the $50 alt: neither the Base tile nor the total may use it.
        market_price: 50,
        remaining_cost: remaining,
        product_id: 13,
        preferred_product_id: 11,
        preferred_market_price: BASE_PRICE,
        tcgplayer_url: "",
        image_url: "https://tcgplayer-cdn.tcgplayer.com/product/13_200w.jpg",
        base_image_url: "https://tcgplayer-cdn.tcgplayer.com/product/11_200w.jpg",
        members: [{ user_id: 1, display_name: "Nami", qty: myQty }],
        alt_arts: [
          { product_id: 12, name: "Manga", market_price: MANGA_PRICE, low_price: 8, image_url: "https://tcgplayer-cdn.tcgplayer.com/product/12_200w.jpg", tcgplayer_url: "", group_name: "Test", is_special: true, wanted: 1, owned: 0 },
        ],
        my_qty: myQty,
        my_suggested_qty: 3,
        my_is_custom: false,
        my_need: 3,
      },
    ],
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

test("Group buy shows the Base tile and prices the card as the total across picked arts (#850)", async ({ page, planner }, testInfo) => {
  let myQty = 3;
  const qtyPuts: number[] = [];
  await page.route(`**/api/group-buys/${GB}`, (route) => route.fulfill({ json: detail(myQty) }));
  await page.route(`**/api/group-buys/${GB}/quantities/OP01-001`, (route) => {
    myQty = (JSON.parse(route.request().postData() ?? "{}") as { qty: number }).qty;
    qtyPuts.push(myQty);
    return route.fulfill({ json: detail(myQty) });
  });
  await planner.open(`/group-buys/${GB}`);
  await expect(page.getByRole("heading", { name: "Luffy split", level: 1 })).toBeVisible();

  const layouts = testInfo.project.name === "phone-375" ? (["Grid", "List"] as const) : (["Grid"] as const);
  for (const layout of layouts) {
    await page.getByRole("group", { name: "Card layout" }).getByRole("button", { name: layout, exact: true }).click();
    const card = page.locator(layout === "Grid" ? ".grid-card" : ".mobile-card").filter({ hasText: "OP01-001" });
    const base = card.locator(".alt-art-base");
    await expect(base).toBeVisible();
    // 3 copies bought, 1 of them the Manga: 2 on the base art, priced at the base printing ($1.00), not the host's $50 checkout printing.
    await expect(base.getByLabel("Roronoa Zoro base art wanted")).toHaveText("2");
    await expect(base).toContainText("$1.00");
    const total = card.getByTestId("gb-arts-total");
    await expect(total).toContainText("$11.00");
    await expect(total).toContainText("Your 3 copies");
    await expect(total).toHaveAttribute("title", "2 × Base $1.00 + 1 × Manga $9.00");
  }

  // One more base copy: qty 4 (alt wants stay first), total $12.00.
  const last = layouts[layouts.length - 1] === "Grid" ? ".grid-card" : ".mobile-card";
  const card = page.locator(last).filter({ hasText: "OP01-001" });
  await card.locator(".alt-art-base").getByRole("button", { name: "Increase want for Roronoa Zoro base art" }).click();
  await expect.poll(() => qtyPuts).toEqual([4]);
  await expect(card.getByTestId("gb-arts-total")).toContainText("$12.00");
  await expect(card.locator(".alt-art-base").getByLabel("Roronoa Zoro base art wanted")).toHaveText("3");
});

test.afterEach(({ planner }) => {
  expect(planner.errors).toEqual([]);
});
