import type { Locator, Page } from "@playwright/test";
import { test, expect, FAKE_API } from "./fixtures";

const STARTER = "test-op17-red";

async function openStarter(page: Page) {
  await page.route(`${FAKE_API}/**`, (route) => route.fulfill({ status: 404, json: { detail: "not in e2e fake API" } }));
  await page.goto("/decks");
  await expect(page.getByText("Starter: OP17 Red")).toBeVisible();
  await page.goto(`/decks/${STARTER}/configure`);
  await expect(page.locator("article.deck-stack").first()).toBeVisible();
}

async function insideViewport(page: Page, el: Locator, bottomLimit?: number): Promise<boolean> {
  const box = await el.boundingBox();
  const vp = page.viewportSize()!;
  if (!box) return false;
  return box.x >= 0 && box.y >= 0 && box.x + box.width <= vp.width && box.y + box.height <= (bottomLimit ?? vp.height);
}

test("the deck editor shows at least 12 main-deck cards on a 1440x900 screen without scrolling (#1343)", async ({ page }, info) => {
  test.skip(info.project.name !== "desktop-1280", "desktop layout");
  await page.setViewportSize({ width: 1440, height: 900 });
  await openStarter(page);
  const tiles = page.locator(".deck-editor-deck article.deck-stack");
  expect(await tiles.count()).toBe(15);
  let inside = 0;
  for (const tile of await tiles.all()) if (await insideViewport(page, tile)) inside++;
  expect(inside).toBeGreaterThanOrEqual(12);
});

test("Add cards shows a result row below the search and colours on a 1440x900 screen (#1343)", async ({ page }, info) => {
  test.skip(info.project.name !== "desktop-1280", "desktop layout");
  await page.setViewportSize({ width: 1440, height: 900 });
  await openStarter(page);
  await page.getByRole("searchbox", { name: "Search" }).fill("luffy");
  const row = page.locator(".deck-add-cards .deck-search-row").first();
  await expect(row).toBeVisible();
  expect(await insideViewport(page, row)).toBe(true);
});

test("main-deck cards are grouped by cost, cheapest first, with the card count in each heading (#1343)", async ({ page }, info) => {
  test.skip(info.project.name !== "desktop-1280", "same markup on every size");
  await openStarter(page);
  const headings = await page.locator(".deck-cost-heading").allInnerTexts();
  const costs = headings.map((h) => Number(/cost (\d+)/i.exec(h)![1]));
  expect(costs).toEqual([...costs].sort((a, b) => a - b));
  expect(new Set(costs).size).toBe(costs.length);
  const counts = await page.locator(".deck-cost-count .visually-hidden").allTextContents();
  expect(counts.map((c) => Number(/(\d+) cards/.exec(c)![1])).reduce((a, b) => a + b, 0)).toBe(50);
});

test("minus on the last copy removes the card and Discard brings it back (#1343)", async ({ page }) => {
  await openStarter(page);
  const tile = page.locator("article.deck-stack", { hasText: "ST23-001" });
  await expect(tile.getByLabel("2 copies")).toBeVisible();
  await expect(page.getByRole("button", { name: /^Remove all/ })).toHaveCount(0);
  await tile.getByRole("button", { name: /^Remove one/ }).click();
  await tile.getByRole("button", { name: /^Remove one/ }).click();
  await expect(tile).toHaveCount(0);
  await page.getByRole("button", { name: "Discard", exact: true }).click();
  await expect(page.locator("article.deck-stack", { hasText: "ST23-001" })).toHaveCount(1);
});

for (const [w, h, minRows] of [[375, 812, 2], [812, 375, 0]] as const) {
  test(`on a ${w}x${h} phone the Leader leads, the bar is pinned and the last card stays reachable (#1343)`, async ({ browser }, info) => {
    test.skip(info.project.name !== "phone-375", "phone layout");
    const context = await browser.newContext({ viewport: { width: w, height: h }, hasTouch: true, isMobile: true, baseURL: process.env.E2E_PAGE_ORIGIN });
    const page = await context.newPage();
    try {
      await openStarter(page);
      const bar = page.locator(".deck-bottom-bar");
      await expect(bar).toBeVisible();
      const barBox = (await bar.boundingBox())!;
      expect(barBox.y + barBox.height).toBeCloseTo(h, 0);
      await expect(bar).toContainText("50/50");
      await expect(page.getByRole("button", { name: "Add cards", exact: true })).toHaveCount(1);

      expect(await insideViewport(page, page.locator(".deck-editor-leader article.deck-stack"), barBox.y)).toBe(true);
      const rows = page.locator(".deck-editor-deck article.deck-stack");
      let visible = 0;
      for (const row of await rows.all()) if (await insideViewport(page, row, barBox.y)) visible++;
      expect(visible).toBeGreaterThanOrEqual(minRows);

      await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
      const end = (await page.locator("footer").last().boundingBox())!;
      expect(end.y + end.height).toBeLessThanOrEqual(barBox.y + 2);
      expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(0);

      await bar.getByRole("button", { name: "Add cards" }).click();
      const sheet = page.getByRole("dialog", { name: "Add cards" });
      await expect(sheet).toBeVisible();
      await sheet.getByRole("searchbox").fill("luffy");
      await expect(sheet.locator(".deck-search-row").first()).toBeVisible();
      await sheet.getByRole("button", { name: "Done" }).click();
      await expect(sheet).toHaveCount(0);
    } finally {
      await context.close();
    }
  });
}
