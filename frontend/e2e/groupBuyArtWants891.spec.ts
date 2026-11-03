/**
 * Group buy alt arts show who wants them: member-coloured chips on the Base and alt
 * tiles, on the member page and on the view-only invite page (#891).
 */
import { expect, test } from "./fixtures";

const GB = 11;
const TOKEN = "gb-invite-891";
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
      { user_id: 2, display_name: "Usopp", role: "member", deck_ids: null, cards_still_needed: 1, remaining_market: 9, card_cost: 9, shipping_share: 0, tax_share: 0, total_owed: 9 },
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
          { user_id: 2, display_name: "Usopp", qty: 1 },
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

async function gridCard(page: import("@playwright/test").Page) {
  await page.getByRole("group", { name: "Card layout" }).getByRole("button", { name: "Grid", exact: true }).click();
  return page.locator(".grid-card").filter({ hasText: "OP01-001" });
}

test("Member page: the alt tile shows who wants it and Base shows its wanters (#891)", async ({ page, planner }, testInfo) => {
  await page.route(`**/api/group-buys/${GB}`, (route) => route.fulfill({ json: detail(false) }));
  await planner.open(`/group-buys/${GB}`);
  await expect(page.getByRole("heading", { name: "Alt art vote", level: 1 })).toBeVisible();
  const card = await gridCard(page);
  const tiles = card.locator(".alt-art");
  await expect(tiles).toHaveCount(3);
  await expect(card.locator(".alt-art-base .alt-art-wants")).toHaveText("Nami ×2");
  await expect(tiles.nth(1).locator(".alt-art-wants")).toHaveText("Usopp ×1");
  // The other alt has no wanters, so no chips.
  await expect(tiles.nth(2).locator(".alt-art-wants")).toHaveCount(0);
  // The member page keeps its steppers.
  await expect(card.getByRole("button", { name: "Increase want for Manga" })).toBeVisible();
  if (SHOTS) await page.screenshot({ path: `${SHOTS}/${testInfo.project.name}-art-wants-member.png`, fullPage: true });
});

test("Invite page: the same chips show with no Want steppers (#891)", async ({ page, planner }, testInfo) => {
  planner.signOut();
  await page.route(`**/api/public/group-buys/${TOKEN}`, (route) =>
    route.fulfill({
      json: { title: "Alt art vote", host_name: "Nami", member_count: 2, status: "open", invite_token: TOKEN, is_public: false, public_path: `/group-buy/view/${TOKEN}` },
    }),
  );
  await page.route(`**/api/public/group-buys/${TOKEN}/view`, (route) => route.fulfill({ json: detail(true) }));
  await planner.open(`/group-buy/join/${TOKEN}`);
  await expect(page.getByText("OP01-001").first()).toBeVisible();
  const card = await gridCard(page);
  const tiles = card.locator(".alt-art");
  // Only Base and the alt somebody wants.
  await expect(tiles).toHaveCount(2);
  await expect(card.locator(".alt-art-base .alt-art-wants")).toHaveText("Nami ×2");
  await expect(tiles.nth(1).locator(".alt-art-wants")).toHaveText("Usopp ×1");
  await expect(card.getByRole("button", { name: /Increase want|Decrease want/ })).toHaveCount(0);
  await expect(card.getByRole("button", { name: /^Show / })).toHaveCount(0);
  if (SHOTS) await page.screenshot({ path: `${SHOTS}/${testInfo.project.name}-art-wants-invite.png`, fullPage: true });
});

test.afterEach(({ planner }) => {
  expect(planner.errors).toEqual([]);
});
