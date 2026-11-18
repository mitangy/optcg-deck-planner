import { expect, test } from "./fixtures";

test.afterEach(({ planner }) => {
  expect(planner.errors).toEqual([]);
});

const IZO = "EB01-002"; // 2 still needed, one alt (201)
const trigger = (page: import("@playwright/test").Page) => page.locator(`[data-buy-split="${IZO}"]:visible`).first();
const incAlt = (page: import("@playwright/test").Page) =>
  page.getByRole("dialog", { name: "Buy Izo as" }).getByRole("button", { name: /^Increase .* to buy$/ }).first();

test("Master Shopping: an alt pick is saved only to the decks left in the filter (#908)", async ({ page, planner }) => {
  planner.addSecondDeck();
  await planner.open("/");
  await expect(trigger(page)).toBeVisible();

  await trigger(page).click();
  await incAlt(page).click();
  await expect.poll(() => planner.printingPuts.length).toBe(1);
  expect(planner.printingPuts[0]!.body.deck_ids).toBeUndefined();
  await page.keyboard.press("Escape");

  await page.getByRole("button", { name: /^Filters/ }).click();
  await page.locator(".deck-filter-list .deck-chip").nth(1).getByRole("checkbox").uncheck();
  await page.getByRole("button", { name: /^Filters/ }).click();
  await trigger(page).click();
  await incAlt(page).click();
  await expect.poll(() => planner.printingPuts.length).toBe(2);
  expect(planner.printingPuts[1]!.body.deck_ids).toEqual([1]);
});
