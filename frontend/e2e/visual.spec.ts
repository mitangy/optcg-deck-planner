/**
 * Pixel snapshots of the planner's key screens at desktop-1200 and phone-375.
 * Tagged @visual so the functional e2e job can skip them (`--grep-invert @visual`)
 * and the visual job can run them alone (`npm run e2e:visual`). The API, the
 * clock and the card art are all faked (see fixtures.ts), so nothing here
 * depends on the network or the date. Baselines are per platform; re-bless with
 * the "Update planner snapshots" workflow (see playwright.config.ts).
 */
import type { Page } from "@playwright/test";
import { expect, test, DECK_ID, SHARE_TOKEN } from "./fixtures";

test.use({ colorScheme: "light" });

const IZO = '[data-card-id="EB01-002"]:visible';

/**
 * Fonts and card art are loaded before the shot, so a late swap can't change the pixels.
 * Promise-based on purpose: the fixed clock freezes timers, so waitForFunction would hang.
 * Only rendered images count: the hidden desktop/phone twin is lazy and never loads.
 */
async function settled(page: Page) {
  await page.evaluate(() => {
    const shown = [...document.images].filter((i) => i.getClientRects().length > 0);
    for (const i of shown) i.loading = "eager";
    return Promise.all([document.fonts.ready, ...shown.map((i) => i.decode().catch(() => undefined))]);
  });
}

test.afterEach(({ planner }) => {
  expect(planner.errors).toEqual([]);
});

test("deck list view @visual", async ({ page, planner }) => {
  await planner.open(`/decks/${DECK_ID}`);
  await expect(page.locator(IZO)).toBeVisible();
  await settled(page);
  await expect(page).toHaveScreenshot("deck-list.png", { fullPage: true });
});

test("deck grid view @visual", async ({ page, planner }) => {
  await planner.open(`/decks/${DECK_ID}`);
  await page.getByRole("button", { name: "Grid", exact: true }).click();
  await expect(page.locator(".grid-card:visible")).toHaveCount(4);
  await settled(page);
  await expect(page).toHaveScreenshot("deck-grid.png", { fullPage: true });
});

test("deck market price panel open @visual", async ({ page, planner }) => {
  await planner.open(`/decks/${DECK_ID}`);
  await page.locator(IZO).getByRole("button", { name: /\$1\.25/ }).click();
  const panel = page.getByRole("region", { name: "Last 3 sold prices" });
  await expect(panel.getByRole("listitem")).toHaveCount(3);
  await settled(page);
  await expect(page).toHaveScreenshot("deck-price-panel.png");
});

test("share page @visual", async ({ page, planner }) => {
  await planner.open(`/share/${SHARE_TOKEN}`);
  await expect(page.getByText(/Shared by Nami/)).toBeVisible();
  await expect(page.getByText("Kid & Killer").filter({ visible: true }).first()).toBeVisible();
  await settled(page);
  await expect(page).toHaveScreenshot("share.png", { fullPage: true });
});
