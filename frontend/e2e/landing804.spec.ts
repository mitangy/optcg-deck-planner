/**
 * The home page at / (#804): visitors who are not signed in see the public landing page
 * instead of a redirect to /login; signed-in players still get the shopping list.
 */
import { expect, formatIssues, test } from "./fixtures";

test.afterEach(({ planner }) => {
  expect(planner.errors).toEqual([]);
});

test("signed out, / shows the landing page and is indexable, no redirect to /login (#804)", async ({ page, planner }) => {
  planner.signOut();
  await planner.open("/");
  await expect(page.getByRole("heading", { level: 1, name: /deck planner with live market prices/i })).toBeVisible();
  await expect(page).toHaveURL(/\/$/);
  await expect(page.getByRole("link", { name: "Sign in with Google" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Browse meta decks" })).toHaveAttribute("href", "/meta");
  await expect(page.locator('meta[name="robots"]')).toHaveCount(0);
  await expect(page.locator('link[rel="canonical"]')).toHaveAttribute("href", "https://optcg-deck-planner.app/");
  const issues = await planner.audit();
  expect(issues, formatIssues(issues)).toEqual([]);
});

test("signed in, / is the shopping list and is noindex (#804)", async ({ page, planner }) => {
  await planner.open("/");
  await expect(page.getByRole("heading", { level: 1, name: /deck planner with live market prices/i })).toHaveCount(0);
  await expect(page.locator(".topbar nav")).toBeVisible();
  await expect(page.locator('meta[name="robots"]')).toHaveAttribute("content", "noindex");
  await expect(page.locator('link[rel="canonical"]')).toHaveCount(0);
});
