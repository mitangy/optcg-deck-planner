/**
 * Master Shopping Price sort counts picked alt arts (#926): the sort uses what you still pay for a
 * card (alt arts you picked to buy at their own price), not just the base market price.
 */
import type { Page } from "@playwright/test";
import { expect, test } from "./fixtures";

test.afterEach(({ planner }) => {
  expect(planner.errors).toEqual([]);
});

const SHOTS = process.env.PR_SHOTS_DIR;
const IZO = "EB01-002"; // base $1.25, 2 still needed, one alt (201) at $14.99
const rows = (page: Page) => page.locator("table tbody tr:visible, .mobile-card-list > [aria-pressed]:visible");
const ids = (page: Page) => rows(page).evaluateAll((els) => els.map((e) => /EB01-\d+/.exec(e.textContent ?? "")?.[0] ?? null));

test("Master Shopping: Price sort puts a card with picked alt arts by its total, not its base price (#926)", async ({ page, planner }, testInfo) => {
  await planner.open("/");
  await expect(rows(page)).toHaveCount(4);

  // Both Izo copies as the $14.99 alt: $29.98, more than EB01-003's $27.20.
  const trigger = page.locator(`[data-buy-split="${IZO}"]:visible`).first();
  await trigger.click();
  const dialog = page.getByRole("dialog", { name: "Buy Izo as" });
  await dialog.getByRole("button", { name: /^Increase .* to buy$/ }).first().click();
  await dialog.getByRole("button", { name: /^Increase .* to buy$/ }).first().click();
  await expect(trigger).toContainText("$29.98");
  await page.keyboard.press("Escape");
  await expect(dialog).toBeHidden();

  if (!(await page.getByRole("button", { name: /^Sort:/ }).isVisible())) await page.getByRole("button", { name: /^Filters/ }).click();
  await page.getByRole("button", { name: /^Sort:/ }).click();
  const panel = page.getByRole("dialog", { name: "Sort order" });
  await expect(panel).toContainText("picked alt arts at their own price");
  await panel.getByLabel("Price").check();
  await page.getByRole("button", { name: /^Sort:/ }).click();
  await expect(panel).toHaveCount(0);

  await expect.poll(() => ids(page)).toEqual([IZO, "EB01-003", "EB01-009", "EB01-011"]);
  if (SHOTS) await page.screenshot({ path: `${SHOTS}/shoppingAltPriceSort926-${testInfo.project.name}-sorted.png`, fullPage: true });
});
