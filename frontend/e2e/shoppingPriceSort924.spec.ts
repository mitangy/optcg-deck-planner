/**
 * Master Shopping Price sort (#924): ticking Price in the Sort menu makes it the main sort, and a
 * column-header sort picked earlier no longer overrides the Sort menu on the desktop table.
 */
import { expect, test } from "./fixtures";

test.afterEach(({ planner }) => {
  expect(planner.errors).toEqual([]);
});

const SHOTS = process.env.PR_SHOTS_DIR;
// Desktop table rows or phone list cards, whichever is on screen, as the card id each one shows.
const rows = (page: import("@playwright/test").Page) => page.locator("table tbody tr:visible, .mobile-card-list > [aria-pressed]:visible");
const ids = (page: import("@playwright/test").Page) =>
  rows(page).evaluateAll((els) => els.map((e) => /EB01-\d+/.exec(e.textContent ?? "")?.[0] ?? null));

test("Master Shopping: ticking Price sorts cards by market price, highest first, even after a header sort (#924)", async ({ page, planner }, testInfo) => {
  await planner.open("/");
  await expect(rows(page)).toHaveCount(4);

  // Desktop only: put the table in lowest-market-first order with the header (two clicks: desc, then asc).
  const marketHeader = page.getByRole("button", { name: "Sort by Market" });
  if (await marketHeader.isVisible()) {
    await marketHeader.click();
    await marketHeader.click();
    await expect.poll(() => ids(page)).toEqual(["EB01-011", "EB01-002", "EB01-009", "EB01-003"]);
  }

  if (!(await page.getByRole("button", { name: /^Sort:/ }).isVisible())) await page.getByRole("button", { name: /^Filters/ }).click();
  await page.getByRole("button", { name: /^Sort:/ }).click();
  const panel = page.getByRole("dialog", { name: "Sort order" });
  await panel.getByLabel("Price").check();
  await page.getByRole("button", { name: /^Sort:/ }).click();
  await expect(panel).toHaveCount(0);

  await expect.poll(() => ids(page)).toEqual(["EB01-003", "EB01-009", "EB01-002", "EB01-011"]);
  if (SHOTS) await page.screenshot({ path: `${SHOTS}/shoppingPriceSort924-${testInfo.project.name}-sorted.png`, fullPage: true });
});
