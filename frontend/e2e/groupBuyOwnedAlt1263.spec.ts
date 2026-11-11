/**
 * Group buy art tiles count alt copies you already own (#1263): the Base "Buy ×N"
 * and your price agree with the who-wants tags the server sends.
 * Real case: OP17-112, deck need 8, own 2 base + 1 of the alt, Want 4 of the alt
 * -> buy 3 of the alt + 2 base.
 */
import { expect, test } from "./fixtures";

const GB = 12;
const SHOTS = process.env.PR_SHOTS_DIR;
const IMG = (n: number) => `https://tcgplayer-cdn.tcgplayer.com/product/${n}_200w.jpg`;

function detail() {
  return {
    id: GB,
    title: "Big Mom buy",
    status: "open",
    invite_token: "gb-invite-1263",
    invite_path: "/group-buy/join/gb-invite-1263",
    host_user_id: 1,
    host_name: "Mikosaur",
    member_count: 1,
    is_host: true,
    is_public: false,
    public_path: "/group-buy/view/gb-invite-1263",
    read_only: false,
    unique_cards: 1,
    cards_still_needed: 5,
    remaining_market: 51.13,
    created_at: "2026-01-10T12:00:00Z",
    members: [
      { user_id: 1, display_name: "Mikosaur", role: "host", deck_ids: null, cards_still_needed: 5, remaining_market: 51.13, card_cost: 51.13, shipping_share: 0, tax_share: 0, total_owed: 51.13 },
    ],
    lines: [
      {
        card_id: "OP17-112",
        name: "Charlotte Linlin",
        color: "Yellow",
        rarity: "SR",
        card_type: "Character",
        cost: "10",
        total_qty: 5,
        market_price: 1.52,
        remaining_cost: 51.13,
        product_id: 21,
        preferred_product_id: 21,
        preferred_market_price: 1.52,
        tcgplayer_url: "",
        image_url: IMG(21),
        base_image_url: IMG(21),
        members: [{ user_id: 1, display_name: "Mikosaur", qty: 5 }],
        alt_arts: [
          { product_id: 22, name: "Alternate Art", market_price: 16.03, low_price: 15, image_url: IMG(22), tcgplayer_url: "", group_name: "Test", is_special: true, wanted: 4, owned: 1, collector: 0 },
          { product_id: 23, name: "Manga", market_price: 709.14, low_price: 700, image_url: IMG(23), tcgplayer_url: "", group_name: "Test", is_special: true, wanted: 0, owned: 0, collector: 0 },
        ],
        // What the server allocates (#1217): owned alt copy covers one of the 4.
        art_wants: [
          { product_id: 22, user_id: 1, qty: 3 },
          { product_id: 21, user_id: 1, qty: 2 },
        ],
        display_art: 22,
        my_qty: 5,
        my_suggested_qty: 5,
        my_is_custom: false,
        my_need: 8,
      },
    ],
    locked_at: null,
    ordered_at: null,
    external_order_id: "",
    order_notes: "",
    shipping_cost: 0,
    shipping_split: "equal",
    tax_cost: 0,
    cards_subtotal: 51.13,
    grand_total: 51.13,
    receipt_text: "",
    has_receipt: false,
    can_undo_purchase: false,
  };
}

for (const layout of ["List", "Grid"] as const) {
  test(`${layout}: Base Buy count matches its who-wants tag when you own a copy of the picked alt (#1263)`, async ({ page, planner }, testInfo) => {
    await page.route(`**/api/group-buys/${GB}`, (route) => route.fulfill({ json: detail() }));
    await planner.open(`/group-buys/${GB}`);
    await expect(page.getByRole("heading", { name: "Big Mom buy", level: 1 })).toBeVisible();
    await page.getByRole("group", { name: "Card layout" }).getByRole("button", { name: layout, exact: true }).click();
    const base = page.locator(".alt-art").filter({ hasText: "Base" }).first();
    await expect(base.locator(".alt-want-label")).toHaveText("Buy ×2");
    await expect(base.locator(".alt-art-want-text")).toHaveText("Mikosaur ×2");
    const alt = page.locator(".alt-art").filter({ has: page.getByText("$16.03") }).first();
    await expect(alt.locator(".alt-want-caption")).toHaveText("Want · own 1");
    await expect(alt.locator(".alt-art-want-text")).toHaveText("Mikosaur ×3");
    if (SHOTS) {
      await base.scrollIntoViewIfNeeded();
      await page.screenshot({ path: `${SHOTS}/${testInfo.project.name}-${layout.toLowerCase()}.png`, fullPage: true });
    }
  });
}

test.afterEach(({ planner }) => {
  expect(planner.errors).toEqual([]);
});
