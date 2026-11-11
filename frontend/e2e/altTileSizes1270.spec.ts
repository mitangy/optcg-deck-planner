/**
 * One standard alt-art tile (#1270): on Shopping and a group buy, the Base tile and every alt tile have the same
 * width, tiles in one row are the same height, and every thumbnail is the same size. List and Grid, at
 * desktop-1200 and phone-375.
 */
import type { Page } from "@playwright/test";
import { expect, test } from "./fixtures";

const GB = 7;
const IZO = "EB01-002";
const IMG = (n: number) => `https://tcgplayer-cdn.tcgplayer.com/product/${n}_200w.jpg`;

function gbDetail() {
  const lines = [
    {
      card_id: "OP09-004",
      name: "Shanks",
      color: "Red",
      rarity: "SR",
      card_type: "Character",
      cost: "5",
      total_qty: 5,
      market_price: 3.5,
      remaining_cost: 4 * 3.5 + 180 + 12,
      product_id: 901,
      preferred_product_id: 901,
      preferred_market_price: 3.5,
      tcgplayer_url: "",
      image_url: IMG(901),
      base_image_url: IMG(901),
      members: [
        { user_id: 1, display_name: "Miko", qty: 3, suggested_qty: 3, is_custom: false },
        { user_id: 2, display_name: "Michael Tang", qty: 2, suggested_qty: 2, is_custom: false },
      ],
      alt_arts: [
        { product_id: 902, name: "Manga", market_price: 180, low_price: 170, image_url: IMG(902), tcgplayer_url: "", group_name: "Test", is_special: true, wanted: 1, owned: 0, collector: 1 },
        { product_id: 903, name: "Parallel", market_price: 12, low_price: 11, image_url: IMG(903), tcgplayer_url: "", group_name: "Test", is_special: true, wanted: 0, owned: 0 },
      ],
      art_wants: [
        { product_id: 901, user_id: 1, qty: 2 },
        { product_id: 902, user_id: 1, qty: 1 },
        { product_id: 902, user_id: 2, qty: 1 },
      ],
      display_art: null,
      my_qty: 3,
      my_suggested_qty: 3,
      my_is_custom: false,
      my_need: 3,
      my_deck_qty: 3,
      my_extras: [{ product_id: 902, name: "Manga", market_price: 180, wanted: 1, skipped: 1 }],
    },
  ];
  const total = lines[0].remaining_cost;
  return {
    id: GB,
    title: "OP09 restock",
    status: "open",
    invite_token: "gb-invite-1270",
    invite_path: "/group-buy/join/gb-invite-1270",
    host_user_id: 1,
    host_name: "Miko",
    member_count: 2,
    is_host: true,
    is_public: false,
    public_path: null,
    unique_cards: 1,
    cards_still_needed: 5,
    remaining_market: total,
    created_at: "2026-11-10T12:00:00Z",
    members: [
      { user_id: 1, display_name: "Miko", role: "host", deck_ids: null, include_extra_copies: true, cards_still_needed: 3, remaining_market: total, card_cost: total, shipping_share: 0, tax_share: 0, total_owed: total },
      { user_id: 2, display_name: "Michael Tang", role: "member", deck_ids: null, include_extra_copies: true, cards_still_needed: 2, remaining_market: 0, card_cost: 0, shipping_share: 0, tax_share: 0, total_owed: 0 },
    ],
    lines,
    locked_at: null,
    ordered_at: null,
    external_order_id: "",
    order_notes: "",
    shipping_cost: 0,
    shipping_split: "equal",
    tax_cost: 0,
    cards_subtotal: total,
    grand_total: total,
    receipt_text: "",
    has_receipt: false,
    can_undo_purchase: false,
  };
}

async function setLayout(page: Page, layout: "List" | "Grid") {
  await page.getByRole("group", { name: "Card layout" }).getByRole("button", { name: layout, exact: true }).click();
}

/** Size of every alt tile on screen (and its thumbnail), plus which tiles share a row. */
async function tileSizes(page: Page) {
  return page.locator(".alt-art:visible").evaluateAll((tiles) =>
    tiles.map((t) => {
      const r = t.getBoundingClientRect();
      const th = t.querySelector(".thumb")!.getBoundingClientRect();
      return { base: t.classList.contains("alt-art-base"), w: r.width, h: r.height, top: Math.round(r.top), tw: th.width, th: th.height };
    }),
  );
}

function expectOneSize(tiles: Awaited<ReturnType<typeof tileSizes>>) {
  expect(tiles.length).toBeGreaterThan(2);
  expect(tiles.some((t) => t.base)).toBe(true);
  expect(tiles.some((t) => !t.base)).toBe(true);
  for (const t of tiles) {
    expect(Math.abs(t.w - tiles[0].w), `tile width ${t.w} vs ${tiles[0].w}`).toBeLessThanOrEqual(1);
    expect(Math.abs(t.tw - 48), `thumb width ${t.tw}`).toBeLessThanOrEqual(1);
    expect(Math.abs(t.th - 67), `thumb height ${t.th}`).toBeLessThanOrEqual(1);
    const row = tiles.filter((o) => Math.abs(o.top - t.top) <= 1);
    for (const o of row) expect(Math.abs(o.h - t.h), `row tile height ${o.h} vs ${t.h}`).toBeLessThanOrEqual(1);
  }
}

for (const layout of ["List", "Grid"] as const) {
  test(`Shopping ${layout}: Base and alt tiles share one width, row height and thumbnail size (#1270)`, async ({ page, planner }) => {
    planner.manyAlts(IZO, 2);
    planner.collectors.set(`${IZO}:202`, 1);
    planner.altWants.set(`${IZO}:202`, 1);
    await planner.open("/");
    await setLayout(page, layout);
    await expect(page.locator(".alt-art-base:visible").first()).toBeVisible();
    expectOneSize(await tileSizes(page));
  });

  test(`Group buy ${layout}: Base and alt tiles share one width, row height and thumbnail size (#1270)`, async ({ page, planner }) => {
    await page.route(`**/api/group-buys/${GB}`, (route) => route.fulfill({ json: gbDetail() }));
    await planner.open(`/group-buys/${GB}`);
    await expect(page.getByRole("heading", { name: "OP09 restock", level: 1 })).toBeVisible();
    await setLayout(page, layout);
    await expect(page.locator(".alt-art-base:visible").first()).toBeVisible();
    // The tile that carries the Extra copy label, who-wants chips and the Skipped badge is the tallest content.
    await expect(page.locator(".alt-collector:visible").first()).toBeVisible();
    await expect(page.locator(".alt-art-wants:visible").first()).toBeVisible();
    expectOneSize(await tileSizes(page));
  });
}

test.afterEach(({ planner }) => {
  expect(planner.errors).toEqual([]);
});
