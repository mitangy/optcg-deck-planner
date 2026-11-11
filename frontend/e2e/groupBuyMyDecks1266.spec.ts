/**
 * Group buy cards show which of the viewer's own selected decks use them (#1266),
 * as the same deck chips Master Shopping uses. A card none of their decks use shows none.
 */
import { expect, test } from "./fixtures";

const GB = 13;
const SHOTS = process.env.PR_SHOTS_DIR;
const IMG = (n: number) => `https://tcgplayer-cdn.tcgplayer.com/product/${n}_200w.jpg`;

function line(id: string, name: string, product: number, myUsedIn: string[]) {
  return {
    card_id: id,
    name,
    color: "Yellow",
    rarity: "SR",
    card_type: "Character",
    cost: "5",
    total_qty: 4,
    market_price: 2,
    remaining_cost: 8,
    product_id: product,
    preferred_product_id: product,
    preferred_market_price: 2,
    tcgplayer_url: "",
    image_url: IMG(product),
    base_image_url: IMG(product),
    members: [
      { user_id: 1, display_name: "Mikosaur", qty: 2 },
      { user_id: 2, display_name: "Pudding fan", qty: 2 },
    ],
    alt_arts: [],
    art_wants: [],
    display_art: null,
    my_qty: 2,
    my_suggested_qty: 2,
    my_is_custom: false,
    my_need: 2,
    my_used_in: myUsedIn,
  };
}

function detail() {
  const member = (user_id: number, display_name: string, role: string) => ({
    user_id, display_name, role, deck_ids: null, cards_still_needed: 4, remaining_market: 8, card_cost: 8, shipping_share: 0, tax_share: 0, total_owed: 8,
  });
  return {
    id: GB,
    title: "Pudding buy",
    status: "open",
    invite_token: "gb-invite-1266",
    invite_path: "/group-buy/join/gb-invite-1266",
    host_user_id: 1,
    host_name: "Mikosaur",
    member_count: 2,
    is_host: true,
    is_public: false,
    public_path: "/group-buy/view/gb-invite-1266",
    read_only: false,
    unique_cards: 2,
    cards_still_needed: 8,
    remaining_market: 16,
    created_at: "2026-01-10T12:00:00Z",
    members: [member(1, "Mikosaur", "host"), member(2, "Pudding fan", "member")],
    lines: [
      line("OP01-001", "Mine Card", 31, ["Pudding", "Pudding eb05"]),
      line("OP01-002", "Their Card", 32, []),
    ],
    locked_at: null,
    ordered_at: null,
    external_order_id: "",
    order_notes: "",
    shipping_cost: 0,
    shipping_split: "equal",
    tax_cost: 0,
    cards_subtotal: 16,
    grand_total: 16,
    receipt_text: "",
    has_receipt: false,
    can_undo_purchase: false,
  };
}

for (const layout of ["List", "Grid"] as const) {
  test(`${layout}: cards list the viewer's own decks as chips and hide them when none (#1266)`, async ({ page, planner }, testInfo) => {
    await page.route(`**/api/group-buys/${GB}`, (route) => route.fulfill({ json: detail() }));
    await planner.open(`/group-buys/${GB}`);
    await expect(page.getByRole("heading", { name: "Pudding buy", level: 1 })).toBeVisible();
    await page.getByRole("group", { name: "Card layout" }).getByRole("button", { name: layout, exact: true }).click();
    const chips = page.locator(".used-in-chip");
    await expect(chips).toHaveText(["Pudding", "Pudding eb05"]);
    await expect(page.getByText("Their Card").first()).toBeVisible();
    await expect(page.locator(".used-in-chips")).toHaveCount(1);
    if (SHOTS) {
      await page.screenshot({ path: `${SHOTS}/mydecks-${testInfo.project.name}-${layout.toLowerCase()}.png`, fullPage: true });
    }
  });
}

test.afterEach(({ planner }) => {
  expect(planner.errors).toEqual([]);
});
