/**
 * The card page's price alert (#1028): Edit opens the editor on screen (it used to float off the page),
 * and a set alert shows as a chip by the actions. Runs at desktop-1200 and phone-375.
 */
import { expect, test } from "./fixtures";
import { mockCardApi, ZORO } from "./cardPageFake";

test.afterEach(({ planner }) => {
  expect(planner.errors).toEqual([]);
});

test("Card page: Price alert and Edit open the alert editor on screen (#1028)", async ({ page, planner }) => {
  await mockCardApi(page);
  await planner.open(`/cards/${ZORO}`);
  await expect(page.getByRole("heading", { name: "Roronoa Zoro", level: 1 })).toBeVisible();

  await page.getByRole("button", { name: "Price alert" }).click();
  const target = page.getByLabel("Target price in dollars");
  await expect(target).toBeInViewport();
  await target.fill("15");
  await page.getByRole("button", { name: "Set alert" }).click();
  await expect.poll(() => planner.priceAlertPosts.length).toBe(1);

  const chip = page.getByRole("group", { name: "Your price alert" });
  await expect(chip).toContainText("Below $15.00");
  await expect(target).toHaveCount(0);

  await chip.getByRole("button", { name: "Edit" }).click();
  await expect(target).toBeInViewport();
  await expect(target).toHaveValue("15.00");
  await target.fill("12");
  await page.getByRole("button", { name: "Save alert" }).click();
  await expect.poll(() => planner.priceAlertPosts.length).toBe(2);
  expect(planner.priceAlertPosts[1]).toMatchObject({ card_id: ZORO, product_id: 0, target_price: 12 });
  await expect(chip).toContainText("Below $12.00");
});
