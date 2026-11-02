/**
 * Group buy detail (/group-buys/:id): every art tile has Show / Shown like
 * Master Shopping, and the card's main image follows the choice (#874).
 */
import { expect, test } from "./fixtures";

const GB = 8;
const BASE_PRICE = 1;
const MANGA_PRICE = 9;
const SHOTS = process.env.PR_SHOTS_DIR;

function detail(displayArt: number | null) {
  const myQty = 3;
  const mangaWant = 0;
  const manga = Math.min(mangaWant, myQty);
  const remaining = (myQty - manga) * BASE_PRICE + manga * MANGA_PRICE;
  return {
    id: GB,
    title: "Zoro art",
    status: "open",
    invite_token: "gb-invite-874",
    invite_path: "/group-buy/join/gb-invite-874",
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
        display_art: displayArt,
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

test("Show picks which art a group buy card displays, on the tile and the main image (#874)", async ({ page, planner }, testInfo) => {
  let displayArt: number | null = null;
  const puts: Array<number | null> = [];
  await page.route(`**/api/group-buys/${GB}`, (route) => route.fulfill({ json: detail(displayArt) }));
  await page.route("**/api/owned/OP01-001/display", (route) => {
    const body = JSON.parse(route.request().postData() ?? "{}") as { product_id: number | null };
    puts.push(body.product_id);
    displayArt = body.product_id;
    return route.fulfill({ json: { card_id: "OP01-001", product_id: body.product_id } });
  });
  await planner.open(`/group-buys/${GB}`);
  await expect(page.getByRole("heading", { name: "Zoro art", level: 1 })).toBeVisible();
  const shot = (name: string) =>
    SHOTS ? page.screenshot({ path: `${SHOTS}/${testInfo.project.name}-${name}.png` }) : Promise.resolve();

  const layouts = testInfo.project.name === "phone-375" ? (["Grid", "List"] as const) : (["Grid"] as const);
  for (const layout of layouts) {
    await page.getByRole("group", { name: "Card layout" }).getByRole("button", { name: layout, exact: true }).click();
    const card = page.locator(layout === "Grid" ? ".grid-card" : ".mobile-card").filter({ hasText: "OP01-001" });
    const main = card.getByRole("img", { name: "Roronoa Zoro", exact: true });
    const base = card.locator(".alt-art-base");
    const manga = card.locator(".alt-art:not(.alt-art-base)");
    await expect(base).toContainText("Shown");
    await expect(main).toHaveAttribute("src", /11_/);
    await shot(`1-${layout}-start`);

    await card.getByRole("button", { name: "Show Manga as the card's art" }).click();
    await expect.poll(() => puts[puts.length - 1]).toBe(12);
    await expect(manga).toContainText("Shown");
    await expect(base).not.toContainText("Shown");
    await expect(main).toHaveAttribute("src", /12_/);
    await shot(`2-${layout}-manga-shown`);

    await card.getByRole("button", { name: "Show Roronoa Zoro base art as the card's art" }).click();
    await expect.poll(() => puts[puts.length - 1]).toBe(0);
    await expect(base).toContainText("Shown");
    await expect(main).toHaveAttribute("src", /11_/);
    puts.length = 0;
    displayArt = null;
    await page.reload();
    await expect(page.getByRole("heading", { name: "Zoro art", level: 1 })).toBeVisible();
  }

  if (testInfo.project.name === "desktop-1200") {
    await page.getByRole("group", { name: "Card layout" }).getByRole("button", { name: "List", exact: true }).click();
    const row = page.locator(".data-table tbody tr").filter({ hasText: "OP01-001" });
    await expect(row.locator(".alt-art-base")).toContainText("Shown");
    await row.getByRole("button", { name: "Show Manga as the card's art" }).click();
    await expect(row.locator(".alt-art:not(.alt-art-base)")).toContainText("Shown");
    await expect(row.getByRole("img", { name: "Roronoa Zoro", exact: true })).toHaveAttribute("src", /12_/);
    await shot("3-table-manga-shown");
  }
});

test.afterEach(({ planner }) => {
  expect(planner.errors).toEqual([]);
});
