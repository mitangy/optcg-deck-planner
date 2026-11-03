/**
 * A who-wants chip on a group buy art tile stays on one line, even with a two-word name (#902).
 */
import { expect, test } from "./fixtures";

const GB = 11;
const TOKEN = "gb-invite-902";
const SHOTS = process.env.PR_SHOTS_DIR;
const IMG = (n: number) => `https://tcgplayer-cdn.tcgplayer.com/product/${n}_200w.jpg`;

function detail(readOnly: boolean) {
  return {
    id: GB,
    title: "Alt art vote",
    status: "open",
    invite_token: TOKEN,
    invite_path: `/group-buy/join/${TOKEN}`,
    host_user_id: 1,
    host_name: "Nami",
    member_count: 2,
    is_host: !readOnly,
    is_public: false,
    public_path: `/group-buy/view/${TOKEN}`,
    read_only: readOnly,
    unique_cards: 1,
    cards_still_needed: 3,
    remaining_market: 13,
    created_at: "2026-01-10T12:00:00Z",
    members: [
      { user_id: 1, display_name: "Nami", role: "host", deck_ids: null, cards_still_needed: 2, remaining_market: 2, card_cost: 2, shipping_share: 0, tax_share: 0, total_owed: 2 },
      { user_id: 2, display_name: "Michael Tang", role: "member", deck_ids: null, cards_still_needed: 1, remaining_market: 9, card_cost: 9, shipping_share: 0, tax_share: 0, total_owed: 9 },
    ],
    lines: [
      {
        card_id: "OP01-001",
        name: "Roronoa Zoro",
        color: "Red",
        rarity: "L",
        card_type: "Leader",
        cost: "5",
        total_qty: 3,
        market_price: 1,
        remaining_cost: 13,
        product_id: 11,
        preferred_product_id: 11,
        preferred_market_price: 1,
        tcgplayer_url: "",
        image_url: IMG(11),
        base_image_url: IMG(11),
        members: [
          { user_id: 1, display_name: "Nami", qty: 2 },
          { user_id: 2, display_name: "Michael Tang", qty: 1 },
        ],
        alt_arts: [
          { product_id: 12, name: "Manga", market_price: 9, low_price: 8, image_url: IMG(12), tcgplayer_url: "", group_name: "Test", is_special: true, wanted: 0, owned: 0 },
          { product_id: 13, name: "Parallel", market_price: 4, low_price: 3, image_url: IMG(13), tcgplayer_url: "", group_name: "Test", is_special: true, wanted: 0, owned: 0 },
        ],
        art_wants: [
          { product_id: 11, user_id: 1, qty: 2 },
          { product_id: 12, user_id: 2, qty: 1 },
        ],
        my_qty: readOnly ? 0 : 2,
        my_suggested_qty: 2,
        my_is_custom: false,
        my_need: readOnly ? 0 : 2,
      },
    ],
    locked_at: null,
    ordered_at: null,
    external_order_id: "",
    order_notes: "",
    shipping_cost: 0,
    shipping_split: "equal",
    tax_cost: 0,
    cards_subtotal: 13,
    grand_total: 13,
    receipt_text: "",
    has_receipt: false,
    can_undo_purchase: false,
  };
}

for (const layout of ["List", "Grid"] as const) {
  test(`${layout}: a two-word who-wants chip stays on one line (#902)`, async ({ page, planner }, testInfo) => {
    await page.route(`**/api/group-buys/${GB}`, (route) => route.fulfill({ json: detail(false) }));
    await planner.open(`/group-buys/${GB}`);
    await expect(page.getByRole("heading", { name: "Alt art vote", level: 1 })).toBeVisible();
    await page.getByRole("group", { name: "Card layout" }).getByRole("button", { name: layout, exact: true }).click();
    const text = page.locator(".alt-art-wants .alt-art-want-text").filter({ hasText: "Michael Tang ×1" }).first();
    await expect(text).toBeVisible();
    const lines = await text.evaluate((el) => {
      const r = document.createRange();
      r.selectNodeContents(el);
      const tops = new Set(Array.from(r.getClientRects()).map((b) => Math.round(b.top)));
      return tops.size;
    });
    expect(lines).toBe(1);
    // The whole name fits: not cut short with an ellipsis.
    const clipped = await text.evaluate((el) => el.scrollWidth > el.clientWidth + 1);
    expect(clipped).toBe(false);
    if (SHOTS) await page.screenshot({ path: `${SHOTS}/${testInfo.project.name}-${layout.toLowerCase()}-chip.png`, fullPage: true });
  });
}

test("A very long name stays on one line and ends in an ellipsis (#902)", async ({ page, planner }) => {
  const long = "Bartholomew Kuma Revolutionary Army";
  const json = detail(false);
  for (const m of json.members) if (m.user_id === 2) m.display_name = long;
  for (const m of json.lines[0].members) if (m.user_id === 2) m.display_name = long;
  await page.route(`**/api/group-buys/${GB}`, (route) => route.fulfill({ json }));
  await planner.open(`/group-buys/${GB}`);
  await expect(page.getByRole("heading", { name: "Alt art vote", level: 1 })).toBeVisible();
  await page.getByRole("group", { name: "Card layout" }).getByRole("button", { name: "List", exact: true }).click();
  const chip = page.locator(".alt-art-wants .group-buy-who-chip").filter({ hasText: "Bartholomew" }).first();
  await expect(chip).toHaveAttribute("title", `${long} wants ×1`);
  const text = chip.locator(".alt-art-want-text");
  const lines = await text.evaluate((el) => {
    const r = document.createRange();
    r.selectNodeContents(el);
    return new Set(Array.from(r.getClientRects()).map((b) => Math.round(b.top))).size;
  });
  expect(lines).toBe(1);
});

test.afterEach(({ planner }) => {
  expect(planner.errors).toEqual([]);
});
