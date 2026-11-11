/**
 * Skip an Extra copy in one group buy (#1269): two cards each need 4 plus 1 Extra alt copy;
 * unticking Shanks' $180 Manga Extra leaves Luffy's $12 Parallel Extra in the buy.
 * Set PR_SHOTS_DIR to save before/after screenshots.
 */
import { expect, test } from "./fixtures";

const GB = 13;
const SHOTS = process.env.PR_SHOTS_DIR;
const IMG = (n: number) => `https://tcgplayer-cdn.tcgplayer.com/product/${n}_200w.jpg`;

type Spec = {
  card_id: string;
  name: string;
  base: number;
  basePrice: number;
  extra: number;
  extraName: string;
  extraPrice: number;
};
const SHANKS: Spec = { card_id: "OP09-004", name: "Shanks", base: 31, basePrice: 2.5, extra: 32, extraName: "Manga", extraPrice: 180 };
const LUFFY: Spec = { card_id: "OP05-060", name: "Monkey.D.Luffy", base: 41, basePrice: 1, extra: 42, extraName: "Parallel", extraPrice: 12 };

function line(c: Spec, skipped: number) {
  const included = 1 - skipped;
  const qty = 4 + included;
  return {
    card_id: c.card_id,
    name: c.name,
    color: "Red",
    rarity: "SR",
    card_type: "Character",
    cost: "5",
    total_qty: qty,
    market_price: c.basePrice,
    remaining_cost: 4 * c.basePrice + included * c.extraPrice,
    product_id: c.base,
    preferred_product_id: c.base,
    preferred_market_price: c.basePrice,
    tcgplayer_url: "",
    image_url: IMG(c.base),
    base_image_url: IMG(c.base),
    members: [{ user_id: 1, display_name: "Mikosaur", qty, suggested_qty: qty, is_custom: false }],
    alt_arts: [
      { product_id: c.extra, name: c.extraName, market_price: c.extraPrice, low_price: c.extraPrice, image_url: IMG(c.extra), tcgplayer_url: "", group_name: "Test", is_special: true, wanted: 0, owned: 0, collector: 1 },
    ],
    art_wants: [
      { product_id: c.base, user_id: 1, qty: 4 },
      ...(included ? [{ product_id: c.extra, user_id: 1, qty: 1 }] : []),
    ],
    display_art: null,
    my_qty: qty,
    my_suggested_qty: qty,
    my_is_custom: false,
    my_need: 4,
    my_deck_qty: 4,
    my_extras: [{ product_id: c.extra, name: c.extraName, market_price: c.extraPrice, wanted: 1, skipped }],
  };
}

function detail(shanksSkipped: number) {
  const lines = [line(LUFFY, 0), line(SHANKS, shanksSkipped)];
  const total = lines.reduce((s, l) => s + l.remaining_cost, 0);
  return {
    id: GB,
    title: "Extras buy",
    status: "open",
    invite_token: "gb-invite-1269",
    invite_path: "/group-buy/join/gb-invite-1269",
    host_user_id: 1,
    host_name: "Mikosaur",
    member_count: 1,
    is_host: true,
    is_public: false,
    public_path: "/group-buy/view/gb-invite-1269",
    read_only: false,
    unique_cards: 2,
    cards_still_needed: lines.reduce((s, l) => s + l.my_qty, 0),
    remaining_market: total,
    created_at: "2026-01-10T12:00:00Z",
    members: [
      { user_id: 1, display_name: "Mikosaur", role: "host", deck_ids: null, include_extra_copies: true, cards_still_needed: 10, remaining_market: total, card_cost: total, shipping_share: 0, tax_share: 0, total_owed: total },
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

for (const layout of ["List", "Grid"] as const) {
  test(`${layout}: unticking one card's Extra copy skips it in this buy and leaves the other card's Extra (#1269)`, async ({ page, planner }, testInfo) => {
    let skipped = 0;
    const puts: { url: string; body: unknown }[] = [];
    await page.route(`**/api/group-buys/${GB}`, (route) => route.fulfill({ json: detail(skipped) }));
    await page.route(`**/api/group-buys/${GB}/extras/**`, (route) => {
      puts.push({ url: new URL(route.request().url()).pathname, body: route.request().postDataJSON() });
      skipped = route.request().postDataJSON().skip;
      return route.fulfill({ json: detail(skipped) });
    });
    await planner.open(`/group-buys/${GB}`);
    await expect(page.getByRole("heading", { name: "Extras buy", level: 1 })).toBeVisible();
    await page.getByRole("group", { name: "Card layout" }).getByRole("button", { name: layout, exact: true }).click();

    const shanksQty = page.getByLabel("Buy quantity for OP09-004");
    const luffyQty = page.getByLabel("Buy quantity for OP05-060");
    const shanksExtra = page.getByRole("checkbox", { name: /Extra copy.*Manga/ });
    const luffyExtra = page.getByRole("checkbox", { name: /Extra copy.*Parallel/ });
    await expect(shanksQty).toHaveValue("5");
    await expect(shanksExtra).toBeChecked();
    await expect(page.getByTestId("gb-deck-qty").first()).toHaveText("4 for your decks");
    await expect(page.getByTestId("gb-extra-skipped")).toHaveCount(0);
    const shot = async (name: string) => {
      if (!SHOTS) return;
      await shanksExtra.scrollIntoViewIfNeeded();
      await page.screenshot({ path: `${SHOTS}/${testInfo.project.name}-${layout.toLowerCase()}-${name}.png`, fullPage: true });
    };
    await shot("before");

    await shanksExtra.click(); // controlled by the server reply, so no uncheck()

    await expect(shanksQty).toHaveValue("4");
    expect(puts).toEqual([{ url: `/api/group-buys/${GB}/extras/OP09-004/${SHANKS.extra}`, body: { skip: 1 } }]);
    await expect(page.getByTestId("gb-extra-skipped")).toHaveCount(1);
    await expect(page.getByTestId("gb-extra-skipped")).toHaveText("Skipped in this buy · still on your Shopping list");
    await expect(page.getByTestId("gb-skipped-badge")).toHaveCount(1);
    await expect(page.getByTestId("gb-skipped-badge")).toHaveText("Skipped this buy");
    await expect(shanksExtra).not.toBeChecked();
    await expect(luffyQty).toHaveValue("5");
    await expect(luffyExtra).toBeChecked();
    await shot("after");
  });
}

test.afterEach(({ planner }) => {
  expect(planner.errors).toEqual([]);
});
