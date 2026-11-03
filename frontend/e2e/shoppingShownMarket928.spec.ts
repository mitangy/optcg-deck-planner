/**
 * Master Shopping's Market price follows the art the card shows (#928): a card showing an alt art
 * lists that alt's price, and its "Last 3 sold" popover looks up that alt's sales, not the base card's.
 * Runs at desktop-1200 and phone-375.
 */
import type { Locator, Page } from "@playwright/test";
import { expect, test } from "./fixtures";

test.afterEach(({ planner }) => {
  expect(planner.errors).toEqual([]);
});

const SHOTS = process.env.PR_SHOTS_DIR;
const IZO = "EB01-002"; // base $1.25 (product 101), one alt (product 201) at $14.99

/** The card's own Market cell (not the alt or Base tiles) in whichever layout is on screen. */
function marketCell(page: Page): Locator {
  const mobile = page.locator(".mobile-card-list > :visible", { hasText: IZO }).locator(".mobile-card-price-main");
  const grid = page.locator(".grid-card-wrap:visible", { hasText: IZO }).locator(".grid-card-price");
  const table = page.locator("table tbody tr:visible", { hasText: IZO }).locator("td").nth(5);
  return mobile.or(grid).or(table);
}

for (const layout of ["List", "Grid"] as const) {
  test(`Master Shopping ${layout}: Market shows the shown alt art's price and sales (#928)`, async ({ page, planner }, testInfo) => {
    await planner.open("/");
    await page.getByRole("group", { name: "Card layout" }).getByRole("button", { name: layout, exact: true }).click();

    // Base art shown: the base price.
    await expect(marketCell(page)).toContainText("$1.25");

    await page.locator(`[aria-label="Show Izo (Alternate Art) as the card's art"]:visible`).first().click();
    await expect(marketCell(page)).toContainText("$14.99");
    await expect(marketCell(page)).not.toContainText("$1.25");

    const before = planner.requests.length;
    await marketCell(page).locator("button.market-price-btn").click();
    await expect(page.getByRole("region", { name: "Last 3 sold prices" }).getByRole("listitem")).toHaveCount(3);
    expect(planner.requests.slice(before)).toContain("GET /catalog/sales/201");
    expect(planner.requests.slice(before)).not.toContain("GET /catalog/sales/101");
    if (SHOTS) await page.screenshot({ path: `${SHOTS}/shoppingShownMarket928-${testInfo.project.name}-${layout.toLowerCase()}.png`, fullPage: true });
  });
}
