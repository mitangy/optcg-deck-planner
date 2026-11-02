/**
 * Group buy detail (/group-buys/:id): + on an alt art moves one copy from the
 * Base art. Your buy stays the shopping number, Base is read-only, and + is
 * disabled once Base has no copy left to move (#870).
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
    invite_token: "gb-invite-870",
    invite_path: "/group-buy/join/gb-invite-870",
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

test("Plus on an alt moves a copy from Base and never changes Your buy (#870)", async ({ page, planner }, testInfo) => {
  const myQty = 3;
  let mangaWant = 0;
  const qtyPuts: number[] = [];
  const printingPuts: number[] = [];
  await page.route(`**/api/group-buys/${GB}`, (route) => route.fulfill({ json: detail(myQty, mangaWant) }));
  await page.route(`**/api/group-buys/${GB}/quantities/OP01-001`, (route) => {
    qtyPuts.push((JSON.parse(route.request().postData() ?? "{}") as { qty: number }).qty);
    return route.fulfill({ json: detail(myQty, mangaWant) });
  });
  await page.route("**/api/cards/OP01-001/printings/12", (route) => {
    mangaWant = (JSON.parse(route.request().postData() ?? "{}") as { qty: number }).qty;
    printingPuts.push(mangaWant);
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
  const plus = card.getByRole("button", { name: "Increase want for Manga" });
  await expect(base).toContainText("Buy ×3");
  // Base is read-only: it has no stepper of its own.
  await expect(card.getByRole("button", { name: /for Roronoa Zoro base art/ })).toHaveCount(0);
  await shot("2-grid-start");

  await plus.click();
  await expect.poll(() => printingPuts).toEqual([1]);
  await expect(base).toContainText("Buy ×2");
  await expect(card.getByLabel("Manga wanted")).toHaveText("1");
  await expect(card.getByLabel("Buy quantity for OP01-001")).toHaveValue("3");
  await expect(card.getByTestId("gb-arts-total")).toContainText("$11.00");
  await expect(card.getByTestId("gb-arts-total")).toHaveAttribute("title", "2 × Base $1.00 + 1 × Manga $9.00");
  await shot("3-grid-alt-moved");

  await plus.click();
  await expect.poll(() => printingPuts).toEqual([1, 2]);
  await expect(plus).toBeEnabled();
  await plus.click();
  await expect.poll(() => printingPuts).toEqual([1, 2, 3]);
  await expect(card.getByLabel("Manga wanted")).toHaveText("3");
  await expect(base).not.toContainText("Buy ×");
  await expect(card.getByLabel("Buy quantity for OP01-001")).toHaveValue("3");
  await expect(plus).toBeDisabled();
  await expect(plus).toHaveAttribute("title", /raise Your buy/);
  await shot("4-grid-base-empty");

  // Your buy was never written by the alt buttons.
  expect(qtyPuts).toEqual([]);
});

test.afterEach(({ planner }) => {
  expect(planner.errors).toEqual([]);
});
