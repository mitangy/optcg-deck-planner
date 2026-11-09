/**
 * Wide monitors (#1212): from 1600px the search/Scan/List-Grid/Filters toolbar
 * moves into a left sidebar and the cards fill the right; below that the
 * toolbar stays above the list and the page keeps its 1200px cap.
 */
import { expect, test } from "./fixtures";

test.afterEach(({ planner }) => {
  expect(planner.errors).toEqual([]);
});

for (const path of ["/shopping", "/collection"]) {
  test(`${path}: on a 1920px screen the toolbar is a left sidebar beside the cards (#1212)`, async ({ page, planner }, testInfo) => {
    test.skip(testInfo.project.name !== "desktop-1200", "viewport is set by the test");
    await page.setViewportSize({ width: 1920, height: 1080 });
    await planner.open(path);
    const toolbar = page.locator(".list-toolbar").first();
    const list = page.locator(".data-table, .card-grid, .collection-grid").filter({ visible: true }).first();
    await expect(toolbar).toBeVisible();
    await expect(list).toBeVisible();
    const t = (await toolbar.boundingBox())!;
    const l = (await list.boundingBox())!;
    expect(t.x + t.width).toBeLessThanOrEqual(l.x);
    const main = (await page.locator(".app-main").boundingBox())!;
    expect(main.width).toBeGreaterThan(1200);
  });

  test(`${path}: on a 1400px screen the toolbar stays above the cards and the page keeps its cap (#1212)`, async ({ page, planner }, testInfo) => {
    test.skip(testInfo.project.name !== "desktop-1200", "viewport is set by the test");
    await page.setViewportSize({ width: 1400, height: 900 });
    await planner.open(path);
    const toolbar = page.locator(".list-toolbar").first();
    const list = page.locator(".data-table, .card-grid, .collection-grid").filter({ visible: true }).first();
    await expect(toolbar).toBeVisible();
    await expect(list).toBeVisible();
    const t = (await toolbar.boundingBox())!;
    const l = (await list.boundingBox())!;
    expect(t.y + t.height).toBeLessThanOrEqual(l.y);
    const main = (await page.locator(".app-main").boundingBox())!;
    expect(main.width).toBeLessThanOrEqual(1200);
  });
}
