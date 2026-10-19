/**
 * Meta page (#443): leaders from the faked /meta API, a leader's decklists, the
 * Top 8 filter, expanding a list, and Create deck. Runs at desktop-1200 and phone-375.
 */
import { expect, formatIssues, test, DECK_ID } from "./fixtures";
import { expectStationary } from "./audit";

test.afterEach(({ planner }) => {
  expect(planner.errors).toEqual([]);
});

test("meta leaders list passes the UI audit and opens a leader in the URL (#443)", async ({ page, planner }) => {
  await planner.open("/meta");
  await expect(page.getByRole("heading", { name: "Meta", level: 1 })).toBeVisible();
  await expect(page.getByRole("link", { name: /Rocks\.D\.Xebec/ })).toBeVisible();
  await expect(page.getByRole("link", { name: "Limitless TCG" })).toHaveAttribute("href", /limitlesstcg\.com/);
  const issues = await planner.audit();
  expect(issues, formatIssues(issues)).toEqual([]);

  await page.getByRole("link", { name: /Rocks\.D\.Xebec/ }).click();
  await expect(page).toHaveURL(/\/meta\?leader=OP17-039$/);
  await expect(page.getByRole("button", { name: /ChinoizeCup/ }).first()).toBeVisible();
  await page.goBack();
  await expect(page).toHaveURL(/\/meta$/);
});

test("expanding a decklist keeps its trigger in place and Create deck posts the list (#443)", async ({ page, planner }) => {
  await planner.open("/meta?leader=OP17-039&top8=1");
  const head = page.locator(".meta-deck-head").first();
  await expect(head).toContainText("1st of 128 · Sep 28 · 7-0-0");
  await expectStationary(head, () => head.click(), "expand decklist");
  await expect(page.locator(".meta-deck-cards .meta-card").first()).toBeVisible();
  const issues = await planner.audit();
  expect(issues, formatIssues(issues)).toEqual([]);

  await page.getByRole("button", { name: "Create deck" }).first().click();
  await expect(page).toHaveURL(new RegExp(`/decks/${DECK_ID}$`));
  expect(planner.createdDecks).toHaveLength(1);
  expect(planner.createdDecks[0].name).toBe("Rocks.D.Xebec – 1st [OP17] ChinoizeCup #115 Monday");
  expect(planner.createdDecks[0].decklist).toMatch(/^1xOP17-039\n/);
});

test("signed out, Create deck sends the visitor to sign in (#443)", async ({ page, planner }) => {
  planner.signOut();
  await planner.open("/meta?leader=OP17-039");
  await page.getByRole("button", { name: "Create deck" }).first().click();
  await expect(page).toHaveURL(/\/login/);
  expect(planner.createdDecks).toEqual([]);
});
