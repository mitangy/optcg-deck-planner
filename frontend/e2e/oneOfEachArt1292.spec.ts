/**
 * One of each art (#1292): a card that lets a deck run any number of copies (Sleeptids OP18-093) and has
 * alt arts gets a "One of each art" action in its buy split. It spreads the deck's copies evenly over
 * the base art and every alt, base first: 8 copies over 3 arts is Base 3, then 3 and 2 in listed order.
 */
import type { Page } from "@playwright/test";
import { expect, formatIssues, test } from "./fixtures";

test.afterEach(({ planner }) => {
  expect(planner.errors).toEqual([]);
});

const SHOTS = process.env.PR_SHOTS_DIR;
const CARD = "OP18-093";
const IZO = "EB01-002"; // has an alt art but is an ordinary card
const CHEAP = 210; // listed first ($6.50)
const PRICEY = 211; // listed second ($12.00)

const trigger = (page: Page, id = CARD) => page.locator(`[data-buy-split="${id}"]:visible`).first();
const dialog = (page: Page, name = "Sleeptids") => page.getByRole("dialog", { name: `Buy ${name} as` });
const spreadBtn = (page: Page) => dialog(page).getByRole("button", { name: /One of each art/ });
const noHorizontalScroll = (page: Page) => page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth);

async function shot(page: Page, name: string, testInfo: { project: { name: string } }) {
  if (SHOTS) await page.screenshot({ path: `${SHOTS}/oneOfEachArt1292-${testInfo.project.name}-${name}.png` });
}

async function openAndSpread(page: Page, testInfo: { project: { name: string } }, prefix: string) {
  await expect(trigger(page)).toBeVisible();
  await trigger(page).scrollIntoViewIfNeeded();
  const before = await trigger(page).boundingBox();
  await trigger(page).click();
  await expect(dialog(page)).toBeVisible();
  await expect(dialog(page)).toContainText("Buy your 8 copies as…");
  await expect(dialog(page).getByLabel("Base copies to buy", { exact: true })).toHaveText("×8");
  // The card stats load lazily; the action appears once they are in.
  await expect(spreadBtn(page)).toBeVisible();
  await expect(spreadBtn(page)).toContainText("Spread your copies across all 3 arts");
  // Opening the panel does not move the trigger, and the page does not scroll sideways.
  expect(await trigger(page).boundingBox()).toEqual(before);
  expect(await noHorizontalScroll(page)).toBe(true);
  if (testInfo.project.name === "phone-375") {
    const box = (await spreadBtn(page).boundingBox())!;
    expect(box.height).toBeGreaterThanOrEqual(44);
    const sheet = (await dialog(page).boundingBox())!;
    const vp = page.viewportSize()!;
    expect(box.x).toBeGreaterThanOrEqual(sheet.x);
    expect(box.x + box.width).toBeLessThanOrEqual(sheet.x + sheet.width);
    expect(sheet.y + sheet.height).toBeLessThanOrEqual(vp.height + 1);
  }
  await shot(page, `${prefix}-popover-open`, testInfo);
  // Where the button sits inside the panel (the panel itself follows the row, which grows as picks add tile labels).
  const inPanel = async () => {
    const b = (await spreadBtn(page).boundingBox())!;
    const p = (await dialog(page).boundingBox())!;
    return { w: b.width, h: b.height, dx: b.x - p.x, dy: b.y - p.y };
  };
  const btnBefore = await inPanel();

  await spreadBtn(page).click();
  await expect(dialog(page).getByLabel("Base copies to buy", { exact: true })).toHaveText("×3");
  await expect(dialog(page).getByLabel("Sleeptids (Alternate Art) to buy", { exact: true })).toHaveText("3");
  await expect(dialog(page).getByLabel("Sleeptids (Special Art) to buy", { exact: true })).toHaveText("2");
  // A save never resizes or moves the button inside the panel, and the panel stays open.
  expect(await inPanel()).toEqual(btnBefore);
  await shot(page, `${prefix}-after-spread`, testInfo);
}

test("Master Shopping: One of each art spreads 8 copies 3/3/2 over base and both alts (#1292)", async ({ page, planner }, testInfo) => {
  planner.addSleeptids();
  await planner.open("/");
  await openAndSpread(page, testInfo, "shopping");
  expect(planner.requests).toContain(`PUT /cards/${CARD}/printings/spread`);
  expect(planner.altWants.get(`${CARD}:${CHEAP}`)).toBe(3);
  expect(planner.altWants.get(`${CARD}:${PRICEY}`)).toBe(2);
  // 3 base at $0.45 + 3 at $6.50 + 2 at $12.00
  await expect(trigger(page)).toContainText("$44.85");
  await page.keyboard.press("Escape");
  await expect(dialog(page)).toBeHidden();
  await expect(page.getByTestId("buy-split-backdrop")).toHaveCount(0); // the phone sheet's backdrop fades out first
  const issues = await planner.audit();
  expect(issues, formatIssues(issues)).toEqual([]);
});

test("Deck page: One of each art saves through the deck endpoint (#1292)", async ({ page, planner }, testInfo) => {
  planner.addSleeptids();
  await planner.open("/decks/1");
  await openAndSpread(page, testInfo, "deck");
  expect(planner.requests).toContain(`PUT /decks/1/cards/${CARD}/printings/spread`);
  expect(planner.requests).not.toContain(`PUT /cards/${CARD}/printings/spread`);
  expect(planner.altWants.get(`${CARD}:${CHEAP}`)).toBe(3);
  expect(planner.altWants.get(`${CARD}:${PRICEY}`)).toBe(2);
  await page.keyboard.press("Escape");
  await expect(page.locator(`[data-card-id="${CARD}"]:visible .alt-want-label`, { hasText: "Buying ×3" })).toHaveCount(1);
});

test("an ordinary card with an alt art does not offer One of each art (#1292)", async ({ page, planner }, testInfo) => {
  planner.addSleeptids();
  await planner.open("/");
  await trigger(page, IZO).click();
  await expect(dialog(page, "Izo")).toBeVisible();
  await expect(dialog(page, "Izo").getByLabel("Base copies to buy")).toBeVisible();
  // Sleeptids shows it by now (stats are loaded for the page), so this proves the card, not a late load.
  await page.keyboard.press("Escape");
  await trigger(page).click();
  await expect(spreadBtn(page)).toBeVisible();
  await page.keyboard.press("Escape");
  await trigger(page, IZO).click();
  await expect(dialog(page, "Izo").getByRole("button", { name: /One of each art/ })).toHaveCount(0);
  await shot(page, "ordinary-card", testInfo);
});

test("Group buy: an editable alt row offers One of each art (#1292)", async ({ page, planner }, testInfo) => {
  const GB = 12;
  let wants: Record<number, number> = {};
  const alt = (id: number, name: string, price: number) => ({
    product_id: id, name, market_price: price, low_price: price, image_url: `https://tcgplayer-cdn.tcgplayer.com/product/${id}_200w.jpg`,
    tcgplayer_url: "", group_name: "Test", is_special: true, wanted: wants[id] ?? 0, owned: 0,
  });
  const detail = () => {
    const alts = [alt(CHEAP, "Sleeptids (Alternate Art)", 6.5), alt(PRICEY, "Sleeptids (Special Art)", 12)];
    const remaining = 8 * 0.45;
    return {
      id: GB, title: "Sleeptids split", status: "open", invite_token: "gb-1292", invite_path: "/group-buy/join/gb-1292", host_user_id: 1, host_name: "Nami",
      member_count: 1, is_host: true, is_public: false, public_path: null, unique_cards: 1, cards_still_needed: 8, remaining_market: remaining, created_at: "2026-01-10T12:00:00Z",
      members: [{ user_id: 1, display_name: "Nami", role: "host", deck_ids: null, cards_still_needed: 8, remaining_market: remaining, card_cost: remaining, shipping_share: 0, tax_share: 0, total_owed: remaining }],
      lines: [{
        card_id: CARD, name: "Sleeptids", color: "Black", rarity: "C", card_type: "Character", cost: "9", total_qty: 8, market_price: 0.45, remaining_cost: remaining,
        product_id: 110, preferred_product_id: 110, preferred_market_price: 0.45, tcgplayer_url: "",
        image_url: "https://tcgplayer-cdn.tcgplayer.com/product/110_200w.jpg", base_image_url: "https://tcgplayer-cdn.tcgplayer.com/product/110_200w.jpg",
        members: [{ user_id: 1, display_name: "Nami", qty: 8 }], alt_arts: alts, my_qty: 8, my_suggested_qty: 8, my_is_custom: false, my_need: 8,
      }],
      locked_at: null, ordered_at: null, external_order_id: "", order_notes: "", shipping_cost: 0, shipping_split: "equal", tax_cost: 0,
      cards_subtotal: remaining, grand_total: remaining, receipt_text: "", has_receipt: false, can_undo_purchase: false,
    };
  };
  const puts: string[] = [];
  await page.route(`**/api/group-buys/${GB}`, (route) => route.fulfill({ json: detail() }));
  await page.route(`**/api/cards/${CARD}/printings/spread`, (route) => {
    puts.push(route.request().method());
    wants = { [CHEAP]: 3, [PRICEY]: 2 };
    return route.fulfill({ json: { card_id: CARD, decks_updated: 1 } });
  });
  await planner.open(`/group-buys/${GB}`);
  await expect(page.getByRole("heading", { name: "Sleeptids split", level: 1 })).toBeVisible();
  await page.getByRole("group", { name: "Card layout" }).getByRole("button", { name: "Grid", exact: true }).click();
  const card = page.locator(".grid-card").filter({ hasText: CARD });
  const btn = card.getByRole("button", { name: /One of each art/ });
  await expect(btn).toBeVisible();
  await btn.scrollIntoViewIfNeeded();
  const before = await btn.boundingBox();
  if (testInfo.project.name === "phone-375") expect(before!.height).toBeGreaterThanOrEqual(44);
  await shot(page, "groupbuy-before", testInfo);
  await btn.click();
  await expect.poll(() => puts).toEqual(["PUT"]);
  await expect(card.getByLabel("Sleeptids (Alternate Art) wanted")).toHaveText("3");
  await expect(card.getByLabel("Sleeptids (Special Art) wanted")).toHaveText("2");
  await expect(card.locator(".alt-art-base")).toContainText("Buy ×3");
  // The card's column widens a little once the base tile says "Buy ×3"; the button keeps its place and height.
  const after = (await btn.boundingBox())!;
  expect({ x: after.x, y: after.y, height: after.height }).toEqual({ x: before!.x, y: before!.y, height: before!.height });
  expect(await noHorizontalScroll(page)).toBe(true);
  await shot(page, "groupbuy-after", testInfo);
});
