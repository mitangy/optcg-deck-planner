/**
 * Group buy invite link (/group-buy/join/:token): shows the read-only group buy
 * with Sign in / Join on top, so people can look before they join (#880).
 */
import { expect, test } from "./fixtures";

const TOKEN = "gb-invite-880";
const SHOTS = process.env.PR_SHOTS_DIR;

function line(id: string, name: string, n: number, qty: number, price: number) {
  const img = `https://tcgplayer-cdn.tcgplayer.com/product/${n}_200w.jpg`;
  return {
    card_id: id,
    name,
    color: "Red",
    rarity: "SR",
    card_type: "Character",
    cost: "5",
    total_qty: qty,
    market_price: price,
    remaining_cost: qty * price,
    product_id: n,
    preferred_product_id: n,
    preferred_market_price: price,
    tcgplayer_url: "",
    image_url: img,
    base_image_url: img,
    members: [{ user_id: 1, display_name: "Nami", qty }],
    alt_arts: [],
    my_qty: 0,
    my_suggested_qty: 0,
    my_is_custom: false,
    my_need: 0,
  };
}

function view() {
  const lines = [line("OP01-001", "Zoro", 11, 3, 4), line("OP01-002", "Usopp", 21, 2, 1)];
  return {
    id: 9,
    title: "Friday night pool",
    status: "open",
    invite_token: TOKEN,
    invite_path: `/group-buy/join/${TOKEN}`,
    host_user_id: 1,
    host_name: "Nami",
    member_count: 2,
    is_host: false,
    is_public: false,
    public_path: `/group-buy/view/${TOKEN}`,
    read_only: true,
    unique_cards: 2,
    cards_still_needed: 5,
    remaining_market: 14,
    created_at: "2026-01-10T12:00:00Z",
    members: [
      { user_id: 1, display_name: "Nami", role: "host", deck_ids: null, cards_still_needed: 5, remaining_market: 14, card_cost: 14, shipping_share: 0, tax_share: 0, total_owed: 14 },
      { user_id: 2, display_name: "Usopp", role: "member", deck_ids: null, cards_still_needed: 0, remaining_market: 0, card_cost: 0, shipping_share: 0, tax_share: 0, total_owed: 0 },
    ],
    lines,
    locked_at: null,
    ordered_at: null,
    external_order_id: "",
    order_notes: "",
    shipping_cost: 0,
    shipping_split: "equal",
    tax_cost: 0,
    cards_subtotal: 14,
    grand_total: 14,
    receipt_text: "",
    has_receipt: false,
    can_undo_purchase: false,
  };
}

async function mockInvite(page: import("@playwright/test").Page, status = "open") {
  await page.route(`**/api/public/group-buys/${TOKEN}`, (route) =>
    route.fulfill({
      json: {
        title: "Friday night pool",
        host_name: "Nami",
        member_count: 2,
        status,
        invite_token: TOKEN,
        is_public: false,
        public_path: `/group-buy/view/${TOKEN}`,
      },
    }),
  );
  await page.route(`**/api/public/group-buys/${TOKEN}/view`, (route) => route.fulfill({ json: view() }));
}

test("Signed out, the invite link shows the cards read-only and Sign in to join (#880)", async ({ page, planner }, testInfo) => {
  planner.signOut();
  await mockInvite(page);
  await planner.open(`/group-buy/join/${TOKEN}`);

  await expect(page.getByRole("heading", { name: "Friday night pool", level: 1 })).toBeVisible();
  await expect(page.getByText("Hosted by Nami · 2 members")).toBeVisible();
  await expect(page.getByText("OP01-001").first()).toBeVisible();
  await expect(page.getByText("OP01-002").first()).toBeVisible();
  // Read-only: no quantity steppers or host actions.
  await expect(page.getByRole("button", { name: "Join group buy" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Leave group buy" })).toHaveCount(0);

  const signIn = page.getByRole("link", { name: "Sign in to join" });
  await expect(signIn).toHaveAttribute("href", `/login?next=${encodeURIComponent(`/group-buy/join/${TOKEN}`)}`);
  if (SHOTS) await page.screenshot({ path: `${SHOTS}/${testInfo.project.name}-share-view-signed-out.png`, fullPage: true });
});

test("Signed in, the invite link shows the cards and a Join group buy button (#880)", async ({ page, planner }, testInfo) => {
  const joins: string[] = [];
  await mockInvite(page);
  await page.route(`**/api/group-buys/join/${TOKEN}`, (route) => {
    joins.push(route.request().method());
    return route.fulfill({ json: { ...view(), is_host: false, read_only: false } });
  });
  await planner.open(`/group-buy/join/${TOKEN}`);

  await expect(page.getByText("OP01-001").first()).toBeVisible();
  await expect(page.getByRole("link", { name: "Sign in to join" })).toHaveCount(0);
  const join = page.getByRole("button", { name: "Join group buy" });
  await expect(join).toBeEnabled();
  if (SHOTS) await page.screenshot({ path: `${SHOTS}/${testInfo.project.name}-share-view-signed-in.png`, fullPage: true });
  await join.click();
  await expect(page).toHaveURL(/\/group-buys\/9$/);
  expect(joins).toEqual(["POST"]);
});

test("A locked group buy still shows the cards but cannot be joined (#880)", async ({ page, planner }) => {
  await mockInvite(page, "locked");
  await planner.open(`/group-buy/join/${TOKEN}`);
  await expect(page.getByText("OP01-001").first()).toBeVisible();
  await expect(page.getByRole("button", { name: "Locked — cannot join" })).toBeDisabled();
});

test("The old /group-buy/view link lands on the invite page (#880)", async ({ page, planner }) => {
  planner.signOut();
  await mockInvite(page);
  await planner.open(`/group-buy/view/${TOKEN}`);
  await expect(page).toHaveURL(new RegExp(`/group-buy/join/${TOKEN}$`));
  await expect(page.getByRole("link", { name: "Sign in to join" })).toBeVisible();
});

test.afterEach(({ planner }) => {
  expect(planner.errors).toEqual([]);
});

test("The view-only invite page shows the alt art the group picked as the main image (#887)", async ({ page, planner }, testInfo) => {
  planner.signOut();
  const altImg = "https://tcgplayer-cdn.tcgplayer.com/product/99_200w.jpg";
  await page.route(`**/api/public/group-buys/${TOKEN}`, (route) =>
    route.fulfill({
      json: { title: "Friday night pool", host_name: "Nami", member_count: 2, status: "open", invite_token: TOKEN, is_public: false, public_path: `/group-buy/view/${TOKEN}` },
    }),
  );
  await page.route(`**/api/public/group-buys/${TOKEN}/view`, (route) => {
    const v = view();
    // The server picks the group's most-wanted alt as display_art (#882).
    const lines = v.lines as Array<Record<string, unknown>>;
    lines[0] = {
      ...v.lines[0],
      alt_arts: [{ product_id: 99, name: "Zoro (Alternate Art)", image_url: altImg, market_price: 30, owned: 0, wanted: 0 }],
      display_art: 99,
    };
    return route.fulfill({ json: v });
  });
  await planner.open(`/group-buy/join/${TOKEN}`);
  await expect(page.getByText("OP01-001").first()).toBeVisible();
  await expect(page.getByRole("img", { name: "Zoro", exact: true }).first()).toHaveAttribute("src", /\/99_/);
  if (SHOTS) await page.screenshot({ path: `${SHOTS}/${testInfo.project.name}-share-view-alt-art.png`, fullPage: true });
});
