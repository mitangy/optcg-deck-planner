/**
 * "Include decks" can be emptied (#1208): Clear all unticks every deck but not the Other chips, an empty
 * selection lists only added cards and Extra copies (not every deck), and Select all brings the decks back.
 */
import { expect, test, type Page } from "./fixtures";

const SHOTS = process.env.PR_SHOTS_DIR;
const IZO = "EB01-002"; // alt 201

test.afterEach(({ planner }) => {
  expect(planner.errors).toEqual([]);
});

const openFilters = (page: Page) => page.getByRole("button", { name: /^Filters/ }).click();
const deckBoxes = (page: Page) => page.locator(".deck-filter-group").filter({ hasNotText: "Other" }).getByRole("checkbox");

test("Master Shopping: Clear all unticks the decks only, and the list keeps just the Extra copies (#1208)", async ({ page, planner }, ti) => {
  planner.collectors.set(`${IZO}:201`, 1);
  await planner.open("/");
  await expect(page.locator(`[data-buy-split="${IZO}"]:visible`).first()).toBeVisible();
  await openFilters(page);

  const clear = page.getByRole("button", { name: "Clear all" });
  const selectAll = page.getByRole("button", { name: "Select all" });
  await expect(clear).toBeEnabled();
  const total = await page.locator(".deck-filter-list .deck-chip").count();
  // Position inside the Include decks block: the stats above the filters can change height when the
  // list reloads for the new pick, which is not a shift caused by the button itself.
  const y = () =>
    clear.evaluate((el) => el.getBoundingClientRect().top - el.closest(".deck-filter")!.getBoundingClientRect().top);
  const before = await y();

  await clear.click();
  await expect(deckBoxes(page).first()).not.toBeChecked();
  for (const box of await deckBoxes(page).all()) await expect(box).not.toBeChecked();
  await expect(page.getByLabel("Extra copies")).toBeChecked();
  await expect(clear).toBeDisabled();
  await expect(selectAll).toBeEnabled();
  expect(await page.locator(".deck-filter-list .deck-chip").count()).toBe(total);
  expect(Math.abs((await y()) - before)).toBeLessThan(1);

  // Only the card with an Extra copy is left, not the decks' cards.
  await expect(page.locator(`[data-buy-split="${IZO}"]:visible`).first()).toBeVisible();
  await expect(page.getByText("Kid & Killer")).toHaveCount(0);
  if (SHOTS) await page.screenshot({ path: `${SHOTS}/${ti.project.name}-shopping-cleared.png`, fullPage: true });
  expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)).toBeLessThanOrEqual(0);

  // Still unticked after a reload: the empty pick is saved, not turned back into every deck.
  await page.reload();
  await expect(page.locator(`[data-buy-split="${IZO}"]:visible`).first()).toBeVisible();
  if (!(await page.getByRole("button", { name: "Clear all" }).isVisible())) await openFilters(page);
  await expect(page.getByRole("button", { name: "Clear all" })).toBeDisabled();
  await expect(page.getByText("Kid & Killer")).toHaveCount(0);

  await page.getByRole("button", { name: "Select all" }).click();
  await expect(page.getByText("Kid & Killer").locator("visible=true").first()).toBeVisible();
});

test("Master Shopping: the Extra copies chip stays on when its decks are unticked (#1208)", async ({ page, planner }) => {
  planner.collectors.set(`${IZO}:201`, 1);
  await planner.open("/");
  await openFilters(page);
  await page.getByRole("button", { name: "Clear all" }).click();
  await page.getByLabel("Extra copies").uncheck();
  await expect(page.locator(`[data-buy-split="${IZO}"]:visible`)).toHaveCount(0);
  await page.getByLabel("Extra copies").check();
  await expect(page.locator(`[data-buy-split="${IZO}"]:visible`).first()).toBeVisible();
});

const GB = 78;
function gbDetail(deckIds: number[] | null) {
  return { id: GB, title: "Friday pool", status: "open", invite_token: "t1208", invite_path: "/group-buy/join/t1208", host_user_id: 1, host_name: "Nami",
    member_count: 1, is_host: true, is_public: false, public_path: null, unique_cards: 0, cards_still_needed: 0, remaining_market: 0, created_at: "2026-01-10T12:00:00Z",
    members: [{ user_id: 1, display_name: "Nami", role: "host", deck_ids: deckIds, include_singles: true, include_extra_copies: true, cards_still_needed: 0, remaining_market: 0, card_cost: 0, shipping_share: 0, tax_share: 0, total_owed: 0 }],
    lines: [{ card_id: "OP01-001", name: "Roronoa Zoro", color: "Red", rarity: "R", card_type: "Character", cost: "3", total_qty: 2, market_price: 1.5, remaining_cost: 3,
      product_id: 11, preferred_product_id: 11, preferred_market_price: 1.5, tcgplayer_url: "", image_url: "", base_image_url: "",
      members: [{ user_id: 1, display_name: "Nami", qty: 2 }], alt_arts: [], art_wants: [], my_qty: 2, my_suggested_qty: 2, my_is_custom: false, my_need: 2 }],
    locked_at: null, ordered_at: null, external_order_id: "", order_notes: "", shipping_cost: 0, shipping_split: "equal", tax_cost: 0, cards_subtotal: 0, grand_total: 0, receipt_text: "", has_receipt: false, can_undo_purchase: false };
}

test("Group buy: Clear all sends an empty deck list and Select all sends none (#1208)", async ({ page, planner }, ti) => {
  let ids: number[] | null = null;
  const puts: unknown[] = [];
  await page.route(`**/api/group-buys/${GB}/contribution`, async (r) => {
    const b = r.request().postDataJSON();
    puts.push(b);
    ids = b.deck_ids;
    await r.fulfill({ json: gbDetail(ids) });
  });
  await page.route(`**/api/group-buys/${GB}`, (r) => r.fulfill({ json: gbDetail(ids) }));
  await planner.open(`/group-buys/${GB}`);
  await expect(page.getByRole("heading", { name: "Friday pool", level: 1 })).toBeVisible();
  await page.locator(".group-buy-merged-toolbar").getByRole("button", { name: /Filters/ }).first().click();

  const clear = page.getByRole("button", { name: "Clear all" });
  const selectAll = page.getByRole("button", { name: "Select all decks" });
  await expect(selectAll).toBeDisabled();
  await clear.click();
  await expect(clear).toBeDisabled();
  await expect(selectAll).toBeEnabled();
  await expect(page.getByLabel("Extra copies")).toBeChecked();
  await expect(page.getByLabel("Cards not in a deck")).toBeChecked();
  if (SHOTS) await page.screenshot({ path: `${SHOTS}/${ti.project.name}-groupbuy-cleared.png`, fullPage: true });
  await selectAll.click();
  await expect(selectAll).toBeDisabled();
  expect(puts).toEqual([
    { deck_ids: [], include_singles: true, include_extra_copies: true },
    { deck_ids: null, include_singles: true, include_extra_copies: true },
  ]);
  expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)).toBeLessThanOrEqual(0);
});

test("Master Shopping: the last ticked deck can be unticked, leaving only the Other chips (#1208)", async ({ page, planner }) => {
  planner.addSecondDeck();
  planner.collectors.set(`${IZO}:201`, 1);
  await planner.open("/");
  await openFilters(page);
  // The deck chips themselves, not their Leader's checkbox.
  const chips = page.locator(".deck-filter-group").filter({ hasNotText: "Other" }).locator(".deck-chip input");
  await expect(chips).toHaveCount(2);
  await chips.nth(0).uncheck();
  await chips.nth(1).uncheck();
  for (const box of await deckBoxes(page).all()) await expect(box).not.toBeChecked();
  await expect(page.getByLabel("Extra copies")).toBeChecked();
  await expect(page.getByText("Kid & Killer")).toHaveCount(0);
});
