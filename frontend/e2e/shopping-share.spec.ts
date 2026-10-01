/**
 * The shopping list (home) and the public share page at /share/:token.
 * Each flow ends with the UI audit; runs at desktop-1200 and phone-375.
 */
import { expect, formatIssues, test, SHARE_TOKEN } from "./fixtures";
import { expectStationary } from "./audit";

test.afterEach(({ planner }) => {
  expect(planner.errors).toEqual([]);
});

test("shopping list hides fully owned cards and passes the audit", async ({ page, planner }) => {
  await planner.open("/");
  await expect(page.getByRole("heading", { name: "Master Shopping", level: 1 })).toBeVisible();
  // "Still need only" is on by default: the fully owned Chopper is not listed.
  await expect(page.getByText("Tony Tony.Chopper")).toHaveCount(0);
  await expect(page.getByText("Kid & Killer").filter({ visible: true }).first()).toBeVisible();

  const price = page.getByRole("button", { name: /\$6\.80/ });
  await expectStationary(price, () => price.click(), "shopping market price");
  await expect(page.getByRole("region", { name: "Last 3 sold prices" })).toBeVisible();
  const issues = await planner.audit();
  expect(issues, formatIssues(issues)).toEqual([]);
});

test("shopping list switches to the grid layout", async ({ page, planner }) => {
  await planner.open("/");
  const grid = page.getByRole("button", { name: "Grid", exact: true });
  await expectStationary(grid, () => grid.click(), "Grid toggle");
  await expect(grid).toHaveAttribute("aria-pressed", "true");
  const issues = await planner.audit();
  expect(issues, formatIssues(issues)).toEqual([]);
});

test("share page lists the shared cards with prices and passes the audit", async ({ page, planner }) => {
  await planner.open(`/share/${SHARE_TOKEN}`);
  await expect(page.getByRole("heading", { name: "Oden Red/Green", level: 1 })).toBeVisible();
  await expect(page.getByText(/Shared by Nami/)).toBeVisible();
  await expect(page.getByText("Kid & Killer").filter({ visible: true }).first()).toBeVisible();
  await expect(page.getByText("Izo", { exact: true }).filter({ visible: true }).first()).toBeVisible();
  expect(planner.requests).toContain(`GET /public/share/${SHARE_TOKEN}`);

  const grid = page.getByRole("button", { name: "Grid", exact: true });
  await expectStationary(grid, () => grid.click(), "Grid toggle");
  const price = page.getByRole("button", { name: /\$6\.80/ });
  await expectStationary(price, () => price.click(), "share market price");
  const issues = await planner.audit();
  expect(issues, formatIssues(issues)).toEqual([]);
});

test("share page for a revoked link says so instead of showing a list", async ({ page, planner }) => {
  await planner.open("/share/not-a-real-token");
  await expect(page.getByText("This share link is no longer available")).toBeVisible();
  await expect(page.getByRole("heading", { level: 1 })).toHaveCount(0);
  const issues = await planner.audit();
  expect(issues, formatIssues(issues)).toEqual([]);
});
