/**
 * Group buy alt tiles say how many copies you buy of that art (#1305), like the Base tile.
 * Real case: OP17-112 Linlin, still need 1, own 1 of the alt, alt Want 1 -> the owned copy
 * covers the want, so the alt buys 0 and Base buys 1.
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
    invite_token: "gb-invite-1305",
    invite_path: "/group-buy/join/gb-invite-1305",
    host_user_id: 1,
    host_name: "Mikosaur",
    member_count: 1,
    is_host: true,
    is_public: false,
    public_path: "/group-buy/view/gb-invite-1305",
    read_only: false,
    unique_cards: 1,
    cards_still_needed: 1,
    remaining_market: 51.13,
    created_at: "2026-01-10T12:00:00Z",
    members: [
      { user_id: 1, display_name: "Mikosaur", role: "host", deck_ids: null, cards_still_needed: 1, remaining_market: 51.13, card_cost: 51.13, shipping_share: 0, tax_share: 0, total_owed: 51.13 },
    ],
    lines: [
      {
        card_id: "OP17-112",
        name: "Charlotte Linlin",
        color: "Yellow",
        rarity: "SR",
        card_type: "Character",
        cost: "10",
        total_qty: 1,
        market_price: 1.52,
        remaining_cost: 51.13,
        product_id: 21,
        preferred_product_id: 21,
        preferred_market_price: 1.52,
        tcgplayer_url: "",
        image_url: IMG(21),
        base_image_url: IMG(21),
        members: [{ user_id: 1, display_name: "Mikosaur", qty: 1 }],
        alt_arts: [
          { product_id: 22, name: "Alternate Art", market_price: 16.03, low_price: 15, image_url: IMG(22), tcgplayer_url: "", group_name: "Test", is_special: true, wanted: 1, owned: 1, collector: 0 },
          { product_id: 23, name: "Manga", market_price: 709.14, low_price: 700, image_url: IMG(23), tcgplayer_url: "", group_name: "Test", is_special: true, wanted: 0, owned: 0, collector: 0 },
        ],
        // The owned alt copy covers the alt want, so the server sends the one copy to buy as Base.
        art_wants: [{ product_id: 21, user_id: 1, qty: 1 }],
        display_art: 21,
        my_qty: 1,
        my_suggested_qty: 1,
        my_is_custom: false,
        my_need: 2,
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
  test(`${layout}: an alt tile says Buy ×0 when the copy you own covers its want, and Base buys it (#1305)`, async ({ page, planner }, testInfo) => {
    await page.route(`**/api/group-buys/${GB}`, (route) => route.fulfill({ json: detail() }));
    await planner.open(`/group-buys/${GB}`);
    await expect(page.getByRole("heading", { name: "Big Mom buy", level: 1 })).toBeVisible();
    await page.getByRole("group", { name: "Card layout" }).getByRole("button", { name: layout, exact: true }).click();
    const base = page.locator(".alt-art").filter({ hasText: "Base" }).first();
    await expect(base.locator(".alt-want-label")).toHaveText("Buy ×1");
    const alt = page.locator(".alt-art").filter({ has: page.getByText("$16.03") }).first();
    await expect(alt.locator(".alt-buy-label")).toHaveText("Buy ×0 · own 1");
    await expect(alt.locator(".alt-want-caption")).toHaveText("Want");
    await expect(alt.getByLabel("Alternate Art wanted")).toHaveText("1");
    const manga = page.locator(".alt-art").filter({ has: page.getByText("$709.14") }).first();
    await expect(manga.locator(".alt-buy-label")).toHaveCount(0);
    // Tiles in the row stay one height, and nothing in a tile spills past it.
    const boxes = await page.locator(".alt-art").evaluateAll((els) =>
      els.map((el) => {
        const r = el.getBoundingClientRect();
        const worst = Math.max(...[...el.querySelectorAll(".alt-meta > *, .alt-art-foot")].map((c) => c.getBoundingClientRect().bottom));
        return { top: r.top, height: r.height, bottom: r.bottom, worst };
      }),
    );
    for (const b of boxes) expect(b.worst).toBeLessThanOrEqual(b.bottom + 0.5);
    const rowTops = new Map<number, number[]>();
    for (const b of boxes) rowTops.set(Math.round(b.top), [...(rowTops.get(Math.round(b.top)) ?? []), b.height]);
    for (const hs of rowTops.values()) expect(Math.max(...hs) - Math.min(...hs)).toBeLessThan(1);
    if (SHOTS) {
      await base.scrollIntoViewIfNeeded();
      await page.screenshot({ path: `${SHOTS}/${testInfo.project.name}-${layout.toLowerCase()}.png`, fullPage: true });
      for (const [w, h, tag] of [[375, 812, "portrait"], [812, 375, "landscape"]] as const) {
        await page.setViewportSize({ width: w, height: h });
        // The layout switches at these widths, so wait for the tiles to re-render.
        const card = page.locator(".alt-arts:visible").first();
        await expect(card.locator(".alt-buy-label")).toBeVisible();
        await page.waitForTimeout(300);
        await card.scrollIntoViewIfNeeded();
        await card.screenshot({ path: `${SHOTS}/${tag}-${layout.toLowerCase()}-${testInfo.project.name}.png` });
      }
    }
  });
}

test.afterEach(({ planner }) => {
  expect(planner.errors).toEqual([]);
});
