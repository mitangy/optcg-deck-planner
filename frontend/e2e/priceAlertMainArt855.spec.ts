/**
 * The lightbox from a card's main picture sets its price alert on the art that picture shows (#896):
 * a card whose display art is an alt must not fall back to the base art. Runs at desktop-1200 and phone-375.
 */
import { expect, test } from "./fixtures";

test.afterEach(({ planner }) => {
  expect(planner.errors).toEqual([]);
});

test("Collection: the enlarged main picture of a card showing an alt sets the alert on that alt (#896)", async ({ page, planner }) => {
  await planner.open("/collection");
  const izo = page.locator('[data-card-id="EB01-002"]:visible');
  // Show the alt (product 201) as the card's picture, then open its main art.
  await izo.getByRole("button", { name: "Show Izo (Alternate Art) as the card's art" }).click();
  await expect(izo.locator("img.thumb").first()).toHaveAttribute("src", /201_400w/);
  await izo.locator("img.thumb").first().click();

  const lightbox = page.getByRole("dialog", { name: "Expanded card art" });
  await lightbox.getByRole("button", { name: "Price alert" }).click();
  await lightbox.getByLabel("Target price in dollars").fill("3.50");
  await lightbox.getByRole("button", { name: "Set alert" }).click();

  await expect.poll(() => planner.priceAlertPosts.length).toBe(1);
  expect(planner.priceAlertPosts[0]).toMatchObject({ card_id: "EB01-002", product_id: 201 });
});

test("Collection: the base art's lightbox still sets the alert on the base art (#896)", async ({ page, planner }) => {
  await planner.open("/collection");
  const izo = page.locator('[data-card-id="EB01-002"]:visible');
  await izo.locator("img.thumb").first().click();
  const lightbox = page.getByRole("dialog", { name: "Expanded card art" });
  await lightbox.getByRole("button", { name: "Price alert" }).click();
  await lightbox.getByLabel("Target price in dollars").fill("3.50");
  await lightbox.getByRole("button", { name: "Set alert" }).click();
  await expect.poll(() => planner.priceAlertPosts.length).toBe(1);
  expect(planner.priceAlertPosts[0]).toMatchObject({ card_id: "EB01-002", product_id: 0 });
});
