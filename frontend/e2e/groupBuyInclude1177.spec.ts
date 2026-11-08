/**
 * Group buy Filters > Include: "Cards not in a deck" and "Extra copies" change your contribution,
 * and ticking them leaves the Filters panel where it was (#1177).
 */
import { expect, test } from "./fixtures";
const GB = 77;
const SHOTS = process.env.PR_SHOTS_DIR;
const IMG = (n: number) => `https://tcgplayer-cdn.tcgplayer.com/product/${n}_200w.jpg`;
function line(card_id: string, name: string, pid: number, qty: number, price: number) {
  return { card_id, name, color: "Red", rarity: "R", card_type: "Character", cost: "3", total_qty: qty, market_price: price, remaining_cost: qty * price,
    product_id: pid, preferred_product_id: pid, preferred_market_price: price, tcgplayer_url: "", image_url: IMG(pid), base_image_url: IMG(pid),
    members: [{ user_id: 1, display_name: "Nami", qty }], alt_arts: [], art_wants: [], my_qty: qty, my_suggested_qty: qty, my_is_custom: false, my_need: qty };
}
function detail(singles: boolean, extras: boolean) {
  const lines = [line("OP01-001", "Roronoa Zoro", 11, 2, 1.5), line("OP01-016", "Nami", 13, 4, 0.5)];
  if (singles) lines.push(line("OP05-119", "Monkey.D.Luffy", 15, 1, 8));
  if (extras) lines.push(line("OP02-004", "Edward.Newgate", 17, 1, 24));
  return { id: GB, title: "Friday pool", status: "open", invite_token: "t1177", invite_path: "/group-buy/join/t1177", host_user_id: 1, host_name: "Nami",
    member_count: 1, is_host: true, is_public: false, public_path: null, unique_cards: lines.length, cards_still_needed: 0, remaining_market: 0, created_at: "2026-01-10T12:00:00Z",
    members: [{ user_id: 1, display_name: "Nami", role: "host", deck_ids: null, include_singles: singles, include_extra_copies: extras, cards_still_needed: 0, remaining_market: 0, card_cost: 0, shipping_share: 0, tax_share: 0, total_owed: 0 }],
    lines, locked_at: null, ordered_at: null, external_order_id: "", order_notes: "", shipping_cost: 0, shipping_split: "equal", tax_cost: 0, cards_subtotal: 0, grand_total: 0, receipt_text: "", has_receipt: false, can_undo_purchase: false };
}
test("Include toggles send your contribution flags and the Filters panel stays put (#1177)", async ({ page, planner }, ti) => {
  let s = true, e = false;
  const puts: unknown[] = [];
  await page.route(`**/api/group-buys/${GB}/contribution`, async (r) => {
    const b = r.request().postDataJSON(); puts.push(b);
    if (typeof b.include_singles === "boolean") s = b.include_singles;
    if (typeof b.include_extra_copies === "boolean") e = b.include_extra_copies;
    await r.fulfill({ json: detail(s, e) });
  });
  await page.route(`**/api/group-buys/${GB}`, (r) => r.fulfill({ json: detail(s, e) }));
  await planner.open(`/group-buys/${GB}`);
  await expect(page.getByRole("heading", { name: "Friday pool", level: 1 })).toBeVisible();
  const toggle = page.locator(".group-buy-merged-toolbar").getByRole("button", { name: /Filters/ }).first();
  await toggle.click();
  const singles = page.getByLabel("Cards not in a deck");
  await expect(singles).toBeVisible();
  const y = () => toggle.evaluate((el) => el.getBoundingClientRect().top + window.scrollY);
  const box1 = await y();
  if (SHOTS) await page.locator(".group-buy-merged-toolbar").screenshot({ path: `${SHOTS}/${ti.project.name}-1-filters-default.png` });
  if (SHOTS) await page.screenshot({ path: `${SHOTS}/${ti.project.name}-1-page-default.png`, fullPage: true });
  await singles.click();
  await expect(page.getByText("Monkey.D.Luffy")).toHaveCount(0);
  await page.getByLabel("Extra copies").click();
  await expect(page.getByText("Edward.Newgate").first()).toBeVisible();
  const box2 = await y();
  expect(Math.abs(box1 - box2)).toBeLessThan(1);
  if (SHOTS) await page.screenshot({ path: `${SHOTS}/${ti.project.name}-2-page-toggled.png`, fullPage: true });
  expect(puts).toEqual([
    { deck_ids: null, include_singles: false, include_extra_copies: false },
    { deck_ids: null, include_singles: false, include_extra_copies: true },
  ]);
  const ow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  expect(ow).toBeLessThanOrEqual(0);
});

test.afterEach(({ planner }) => {
  expect(planner.errors).toEqual([]);
});
