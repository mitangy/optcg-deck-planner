/**
 * Big monitors (#1325): from 1600px wide the whole planner scales up (root font size grows from 16px,
 * so text, card art and tiles follow); below 1600px nothing changes. Wider must not mean sideways scroll.
 */
import { expect, test, DECK_ID } from "./fixtures";

test.afterEach(({ planner }) => {
  expect(planner.errors).toEqual([]);
});

const rootFont = (page: import("@playwright/test").Page) =>
  page.evaluate(() => parseFloat(getComputedStyle(document.documentElement).fontSize));

async function listThumbWidth(page: import("@playwright/test").Page) {
  const thumb = page.locator(".data-table .card-cell-inner .thumb").filter({ visible: true }).first();
  await expect(thumb).toBeVisible();
  return (await thumb.boundingBox())!.width;
}

// Compared with 1600px, where the wide layout starts: below it the art fills its column (up to 220px),
// and from 1600px the #1212 list cap shrinks it, so 1440px is not a like-for-like width.
test("a 2560px screen scales the planner and its card art up from a 1600px screen (#1325)", async ({ page, planner }, testInfo) => {
  test.skip(testInfo.project.name !== "desktop-1200", "viewport is set by the test");
  await page.setViewportSize({ width: 1600, height: 900 });
  await planner.open(`/decks/${DECK_ID}`);
  const small = await listThumbWidth(page);
  await page.setViewportSize({ width: 2560, height: 1440 });
  const big = await listThumbWidth(page);
  expect(await rootFont(page)).toBeGreaterThan(19);
  expect(big / small).toBeGreaterThan(1.15);
});

test("a 1440px screen keeps the 16px root font size (#1325)", async ({ page, planner }, testInfo) => {
  test.skip(testInfo.project.name !== "desktop-1200", "viewport is set by the test");
  await page.setViewportSize({ width: 1440, height: 900 });
  await planner.open("/shopping");
  expect(await rootFont(page)).toBe(16);
  await page.setViewportSize({ width: 1599, height: 900 });
  expect(await rootFont(page)).toBe(16);
});

for (const width of [1920, 2560]) {
  for (const path of [`/decks/${DECK_ID}`, "/shopping"]) {
    test(`${path} does not scroll sideways at ${width}px wide (#1325)`, async ({ page, planner }, testInfo) => {
      test.skip(testInfo.project.name !== "desktop-1200", "viewport is set by the test");
      await page.setViewportSize({ width, height: 1080 });
      await planner.open(path);
      await expect(page.locator(".data-table, .card-grid").filter({ visible: true }).first()).toBeVisible();
      const { sw, iw } = await page.evaluate(() => ({ sw: document.documentElement.scrollWidth, iw: window.innerWidth }));
      expect(sw).toBeLessThanOrEqual(iw);
    });
  }
}
