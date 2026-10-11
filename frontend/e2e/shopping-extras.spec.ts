/**
 * Master Shopping's "Add cards" drawer: search the catalog and add cards to buy
 * without a deck (#525). Runs at desktop-1200 and phone-375; flows end with the UI audit.
 */
import { expect, formatIssues, test } from "./fixtures";

test.afterEach(({ planner }) => {
  expect(planner.errors).toEqual([]);
});

const addPanel = (page: import("@playwright/test").Page) => page.locator(".shopping-add");

test("with no decks, cards added from the drawer make the shopping list (#525)", async ({ page, planner }) => {
  planner.noDecks();
  await planner.open("/");
  await expect(page.getByRole("heading", { name: "Master Shopping", level: 1 })).toBeVisible();
  await expect(page.getByText("No decks yet.")).toBeVisible();

  // The drawer is open by default while the list is empty.
  await addPanel(page).getByRole("searchbox").fill("Mini");
  await page.getByRole("button", { name: "Add EB01-011 to shopping list" }).click();
  await expect.poll(() => planner.extras.get("EB01-011")).toBe(1);

  const row = page.getByText("Added directly").filter({ visible: true }).first();
  await expect(row).toBeVisible();
  await expect(page.getByText("No decks yet.")).toHaveCount(0);

  // The result row now steps copies to buy: + raises the target, − lowers it, back to Add after Remove.
  await page.getByRole("button", { name: "Buy more EB01-011" }).click();
  await expect.poll(() => planner.extras.get("EB01-011")).toBe(2);
  await page.getByRole("button", { name: "Buy fewer EB01-011" }).click();
  await expect.poll(() => planner.extras.get("EB01-011")).toBe(1);

  await page.getByRole("button", { name: "Remove EB01-011 from added cards" }).filter({ visible: true }).first().click();
  await expect.poll(() => planner.extras.has("EB01-011")).toBe(false);
  await expect(page.getByRole("button", { name: "Add EB01-011 to shopping list" })).toBeVisible();

  const issues = await planner.audit();
  expect(issues, formatIssues(issues)).toEqual([]);
});

test("a direct target above the deck need raises the list and the Collection shows Buying (#525)", async ({ page, planner }) => {
  await planner.open("/");
  // Izo: the deck needs 4 and 2 are owned, so 2 are still to buy.
  await addPanel(page).getByRole("button", { name: /Add cards/ }).click();
  await addPanel(page).getByRole("searchbox").fill("Izo");
  const result = page.locator('[data-catalog-id="EB01-002"]');
  await expect(result).toContainText("Owned 2 · Decks need 4");
  // Nothing was added directly yet, so there is nothing to step down.
  await expect(result.getByRole("button", { name: "Buy fewer EB01-002" })).toBeDisabled();

  await result.getByRole("button", { name: "Buy more EB01-002" }).click();
  // Target = owned 2 + 2 to buy + 1 = 5 (max with the deck's 4, not the sum).
  await expect.poll(() => planner.extras.get("EB01-002")).toBe(5);
  await expect(page.getByText("Oden Red/Green · Added directly (want 5)").filter({ visible: true }).first()).toBeVisible();

  await planner.open("/collection");
  await expect(page.locator('[data-card-id="EB01-002"]:visible')).toContainText("Buying 3");
  const issues = await planner.audit();
  expect(issues, formatIssues(issues)).toEqual([]);
});

test("turning off Added directly leaves directly added copies out of the list (#525)", async ({ page, planner }) => {
  // Mini-Merry: the deck needs 1, the direct target is 2.
  planner.extras.set("EB01-011", 2);
  await planner.open("/");
  const note = "Oden Red/Green · Added directly (want 2)";
  await expect(page.getByText(note).filter({ visible: true }).first()).toBeVisible();

  await page.getByRole("button", { name: /Filters/ }).click();
  await page.getByRole("checkbox", { name: "Added directly" }).uncheck();
  await expect(page.getByText(note)).toHaveCount(0);
  await expect(page.getByText("Oden Red/Green").filter({ visible: true }).first()).toBeVisible();
});

test("Shopping remembers Still need only and the Add cards color after a reload (#527)", async ({ page, planner }) => {
  await planner.open("/");
  await page.getByRole("button", { name: /Filters/ }).click();
  await expect(page.getByLabel("Still need only")).toBeChecked();
  await page.getByLabel("Still need only").uncheck();

  await addPanel(page).getByRole("button", { name: /Add cards/ }).click();
  const color = addPanel(page).getByLabel("Filter catalog by color");
  await color.selectOption("Blue");

  await page.reload();
  // The Filters drawer remembers that it was open, so it is already showing the checkbox.
  await expect(page.getByLabel("Still need only")).not.toBeChecked();
  await expect(addPanel(page).getByLabel("Filter catalog by color")).toHaveValue("Blue");
});
