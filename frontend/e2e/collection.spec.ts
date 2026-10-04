/**
 * The Collection page (/collection): every owned card with its market value
 * and the collection total, plus search, filters and sorting. Runs at
 * desktop-1200 and phone-375 and ends each flow with the UI audit.
 */
import { expect, formatIssues, test } from "./fixtures";
import { expectStationary } from "./audit";

const row = (id: string) => `[data-card-id="${id}"]:visible`;

test.beforeEach(async ({ page, planner }) => {
  await planner.open("/collection");
  await expect(page.getByRole("heading", { name: "Collection", level: 1 })).toBeVisible();
});

test.afterEach(({ planner }) => {
  expect(planner.errors).toEqual([]);
});

test("lists owned cards by value with the collection total and passes the audit (#268)", async ({ page, planner }) => {
  const totals = page.getByRole("list", { name: "Collection totals" });
  // Oden 1 × $2.40 + Izo 2 × $1.25 + Chopper 3 × $0.30; unowned cards are left out.
  await expect(totals).toContainText("$5.80");
  await expect(totals).toContainText("6");
  await expect(page.locator(row("EB01-003"))).toHaveCount(0);
  // Value sort (the default) puts Izo's $2.50 ahead of Oden's $2.40 even though Oden's price is higher.
  const ids = await page.locator("[data-card-id]:visible").evaluateAll((els) => els.map((e) => e.getAttribute("data-card-id")));
  expect(ids).toEqual(["EB01-002", "EB01-001", "EB01-006"]);
  await expect(page.locator(row("EB01-002"))).toContainText("$2.50");

  const issues = await planner.audit();
  expect(issues, formatIssues(issues)).toEqual([]);
});

test("stepping Owned updates the card value and the total (#268)", async ({ page, planner }) => {
  await page.locator(row("EB01-006")).getByRole("button", { name: "Increase owned" }).click();
  await expect(page.getByRole("list", { name: "Collection totals" })).toContainText("$6.10");
  await expect(page.locator(row("EB01-006"))).toContainText("$1.20");
  await expect.poll(() => planner.owned.get("EB01-006")).toBe(4);
});

test("color filter narrows the list and shows the filtered total (#268)", async ({ page, planner }) => {
  const toggle = page.getByRole("button", { name: /Filters/ });
  await expectStationary(toggle, () => toggle.click(), "Filters toggle");
  await page.getByRole("checkbox", { name: "Green" }).check();
  await expect(page.locator("[data-card-id]:visible")).toHaveCount(1);
  await expect(page.locator(row("EB01-001"))).toBeVisible();
  await expect(page.getByRole("status")).toContainText("Showing 1 of 3 cards · 1 copy · $2.40");
  const issues = await planner.audit();
  expect(issues, formatIssues(issues)).toEqual([]);
});
