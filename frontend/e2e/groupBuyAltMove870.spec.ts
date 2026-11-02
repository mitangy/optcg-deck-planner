/**
 * Group buy detail (/group-buys/:id): each art tile is its own count. Your buy
 * is Base + every alt want, so + on an alt adds a copy even after Base went to 0,
 * and the host no longer gets a Printing dropdown (#868).
 */
import { expect, test } from "./fixtures";

const GB = 8;
const BASE_PRICE = 1;
const MANGA_PRICE = 9;
const SHOTS = process.env.PR_SHOTS_DIR;

function detail(myQty: number, mangaWant: number) {
  const manga = Math.min(mangaWant, myQty);
  const remaining = (myQty - manga) * BASE_PRICE + manga * MANGA_PRICE;
  return {
    id: GB,
    title: "Zoro split",
    status: "open",
    invite_token: "gb-invite-868",
    invite_path: "/group-buy/join/gb-invite-868",
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
        market_price: BASE_PRICE,
        remaining_cost: remaining,
        product_id: 11,
        preferred_product_id: 11,
        preferred_market_price: BASE_PRICE,
        tcgplayer_url: "",
        image_url: "https://tcgplayer-cdn.tcgplayer.com/product/11_200w.jpg",
        base_image_url: "https://tcgplayer-cdn.tcgplayer.com/product/11_200w.jpg",
        members: [{ user_id: 1, display_name: "Nami", qty: myQty }],
        alt_arts: [
          { product_id: 12, name: "Manga", market_price: MANGA_PRICE, low_price: 8, image_url: "https://tcgplayer-cdn.tcgplayer.com/product/12_200w.jpg", tcgplayer_url: "", group_name: "Test", is_special: true, wanted: mangaWant, owned: 0 },
        ],
        my_qty: myQty,
        my_suggested_qty: 3,
        my_is_custom: myQty !== 3,
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

test("Raising an alt want after Base went to 0 adds a copy to Your buy (#868)", async ({ page, planner }, testInfo) => {
  let myQty = 3;
  let mangaWant = 0;
  const qtyPuts: number[] = [];
  await page.route(`**/api/group-buys/${GB}`, (route) => route.fulfill({ json: detail(myQty, mangaWant) }));
  await page.route(`**/api/group-buys/${GB}/quantities/OP01-001`, (route) => {
    myQty = (JSON.parse(route.request().postData() ?? "{}") as { qty: number }).qty;
    qtyPuts.push(myQty);
    return route.fulfill({ json: detail(myQty, mangaWant) });
  });
  await page.route("**/api/cards/OP01-001/printings/12", (route) => {
    mangaWant = (JSON.parse(route.request().postData() ?? "{}") as { qty: number }).qty;
    return route.fulfill({ json: { card_id: "OP01-001", product_id: 12, qty: mangaWant, decks_updated: 1 } });
  });
  await planner.open(`/group-buys/${GB}`);
  await expect(page.getByRole("heading", { name: "Zoro split", level: 1 })).toBeVisible();
  const shot = (name: string) =>
    SHOTS ? page.screenshot({ path: `${SHOTS}/${testInfo.project.name}-${name}.png` }) : Promise.resolve();

  if (testInfo.project.name === "desktop-1200") {
    await page.getByRole("group", { name: "Card layout" }).getByRole("button", { name: "List", exact: true }).click();
    await expect(page.locator(".data-table")).toBeVisible();
    await shot("1-list-host");
  }
  await page.getByRole("group", { name: "Card layout" }).getByRole("button", { name: "Grid", exact: true }).click();
  const card = page.locator(".grid-card").filter({ hasText: "OP01-001" });
  const base = card.locator(".alt-art-base");
  await expect(base.getByLabel("Roronoa Zoro base art wanted")).toHaveText("3");
  await shot("2-grid-start");

  for (let i = 0; i < 3; i++) {
    await base.getByRole("button", { name: "Decrease want for Roronoa Zoro base art" }).click();
    await expect.poll(() => myQty).toBe(2 - i);
  }
  await expect(base.getByLabel("Roronoa Zoro base art wanted")).toHaveText("0");

  await card.getByRole("button", { name: "Increase want for Manga" }).click();
  await expect.poll(() => mangaWant).toBe(1);
  await expect.poll(() => qtyPuts.at(-1)).toBe(1);
  await expect(card.getByTestId("gb-arts-total")).toContainText("$9.00");
  await expect(card.getByTestId("gb-arts-total")).toContainText("Your 1 cop");
  await expect(base.getByLabel("Roronoa Zoro base art wanted")).toHaveText("0");
  await shot("3-grid-alt-added");
});

test.afterEach(({ planner }) => {
  expect(planner.errors).toEqual([]);
});
