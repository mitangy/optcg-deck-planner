import { expect, formatIssues, test } from "./fixtures";

test.afterEach(({ planner }) => {
  expect(planner.errors).toEqual([]);
});

const addPanel = (page: import("@playwright/test").Page) => page.locator(".shopping-add");
const openAdd = async (page: import("@playwright/test").Page) => {
  if (!(await addPanel(page).isVisible())) await page.getByRole("button", { name: "Add cards" }).click();
  await expect(addPanel(page)).toBeVisible();
};

test("with no decks, cards added from the drawer make the shopping list (#525)", async ({ page, planner }) => {
  planner.noDecks();
  await planner.open("/");
  await expect(page.getByRole("heading", { name: "Master Shopping", level: 1 })).toBeVisible();
  await expect(page.getByText("No decks yet.")).toBeVisible();

  await openAdd(page);
  await addPanel(page).getByRole("searchbox").fill("Mini");
  await page.getByRole("button", { name: "Add EB01-011 to shopping list" }).click();
  await expect.poll(() => planner.extras.get("EB01-011")).toBe(1);

  const row = page.getByText("Added directly").filter({ visible: true }).first();
  await expect(row).toBeVisible();
  await expect(page.getByText("No decks yet.")).toHaveCount(0);

  await page.getByRole("button", { name: "Buy more EB01-011" }).click();
  await expect.poll(() => planner.extras.get("EB01-011")).toBe(2);
  await page.getByRole("button", { name: "Buy fewer EB01-011" }).click();
  await expect.poll(() => planner.extras.get("EB01-011")).toBe(1);

  await page.getByRole("button", { name: "Remove EB01-011 from added cards" }).filter({ visible: true }).first().click();
  await expect.poll(() => planner.extras.has("EB01-011")).toBe(false);
  await openAdd(page);
  await addPanel(page).getByRole("searchbox").fill("Mini");
  await expect(page.getByRole("button", { name: "Add EB01-011 to shopping list" })).toBeVisible();

  const issues = await planner.audit();
  expect(issues, formatIssues(issues)).toEqual([]);
});

test("a direct target above the deck need raises the list and the Collection shows Buying (#525)", async ({ page, planner }) => {
  await planner.open("/");
  await openAdd(page);
  await addPanel(page).getByRole("searchbox").fill("Izo");
  const result = page.locator('[data-catalog-id="EB01-002"]');
  await expect(result).toContainText("Own 2 · Decks need 4");
  await expect(result.getByRole("button", { name: "Buy fewer EB01-002" })).toBeDisabled();

  await result.getByRole("button", { name: "Buy more EB01-002" }).click();
  await expect.poll(() => planner.extras.get("EB01-002")).toBe(5);
  await expect(page.getByText("Added directly").filter({ visible: true }).first()).toBeVisible();
  await expect(page.getByText("+1 over decks").filter({ visible: true }).first()).toBeVisible();
  await expect(page.locator(".used-in-chip", { hasText: "Oden Red/Green" }).filter({ visible: true }).first()).toBeVisible();

  await planner.open("/collection");
  await expect(page.locator('[data-card-id="EB01-002"]:visible')).toContainText("Buying 3");
  const issues = await planner.audit();
  expect(issues, formatIssues(issues)).toEqual([]);
});

test("turning off Added directly leaves directly added copies out of the list (#525)", async ({ page, planner }) => {
  planner.extras.set("EB01-011", 2);
  await planner.open("/");
  const note = page.locator(".used-in-chip", { hasText: "Added directly" });
  await expect(note.filter({ visible: true }).first()).toBeVisible();

  await page.getByRole("button", { name: /Filters/ }).click();
  await page.getByRole("checkbox", { name: "Added directly" }).uncheck();
  await expect(note).toHaveCount(0);
  await expect(page.getByText("Oden Red/Green").filter({ visible: true }).first()).toBeVisible();
});

test("Shopping remembers To buy only and the Add cards color after a reload (#527)", async ({ page, planner }) => {
  await planner.open("/");
  await page.getByRole("button", { name: /Filters/ }).click();
  await expect(page.getByLabel("To buy only")).toBeChecked();
  await page.getByLabel("To buy only").uncheck();

  await openAdd(page);
  const color = addPanel(page).getByLabel("Filter catalog by color");
  await color.click();
  await page.getByRole("option", { name: "Blue", exact: true }).click();

  await page.reload();
  await page.getByRole("button", { name: /Filters/ }).click();
  await expect(page.getByLabel("To buy only")).not.toBeChecked();
  await page.keyboard.press("Escape");
  await openAdd(page);
  await expect(addPanel(page).getByLabel("Filter catalog by color")).toHaveText(/Blue/);
});

test("the Want stepper raises a card over its decks, stops at the deck need, and Reset goes back (#867)", async ({ page, planner }) => {
  await planner.open("/");
  const fewer = page.getByRole("button", { name: "Need fewer of Mini-Merry" }).filter({ visible: true }).first();
  const more = page.getByRole("button", { name: "Need more of Mini-Merry" }).filter({ visible: true }).first();
  await expect(fewer).toBeDisabled();

  await more.click();
  await expect.poll(() => planner.extras.get("EB01-011")).toBe(2);
  await more.click();
  await expect.poll(() => planner.extras.get("EB01-011")).toBe(3);
  await expect(page.getByText("+2 over decks").filter({ visible: true }).first()).toBeVisible();

  await fewer.click();
  await expect.poll(() => planner.extras.get("EB01-011")).toBe(2);
  await fewer.click();
  await expect.poll(() => planner.extras.has("EB01-011")).toBe(false);
  await expect(fewer).toBeDisabled();

  await more.click();
  await expect.poll(() => planner.extras.get("EB01-011")).toBe(2);
  await page.getByRole("button", { name: "Reset need for EB01-011 to decks" }).filter({ visible: true }).first().click();
  await expect.poll(() => planner.extras.has("EB01-011")).toBe(false);
  await expect(page.getByText("+1 over decks")).toHaveCount(0);

  const issues = await planner.audit();
  expect(issues, formatIssues(issues)).toEqual([]);
});
