import type { Page } from "@playwright/test";
import { expect, test, DECK_ID } from "./fixtures";

const IZO = "EB01-002";

test.afterEach(({ planner }) => {
  expect(planner.errors).toEqual([]);
});

const altHeaders = (page: Page) => page.locator("thead th").filter({ hasText: /^Alt arts$/ });

async function firstStrip(page: Page) {
  const strip = page.locator("tr.alt-strip-row").first();
  await expect(strip).toBeVisible();
  const main = strip.locator("xpath=preceding-sibling::tr[1]");
  const tiles = strip.locator(".alt-art");
  expect(await tiles.count()).toBeGreaterThan(3);
  const boxes = await tiles.evaluateAll((els) => els.map((e) => e.getBoundingClientRect().toJSON()));
  return {
    boxes,
    strip: (await strip.boundingBox())!,
    main: (await main.boundingBox())!,
    label: await strip.locator(".alt-tray-label").innerText(),
  };
}

function expectSideBySide(s: Awaited<ReturnType<typeof firstStrip>>) {
  const [a, b] = s.boxes;
  expect(b.top).toBeCloseTo(a.top, 0);
  expect(b.left).toBeGreaterThan(a.right);
  expect(s.strip.y).toBeGreaterThanOrEqual(s.main.y + s.main.height - 1);
  expect(s.label.replace(/\s+/g, " ").trim().toLowerCase()).toBe("alt arts · 6");
}

test("1920px Master Shopping: no Alt arts column, the alt tiles sit side by side under the card's numbers (#1329)", async ({ page, planner }, testInfo) => {
  test.skip(testInfo.project.name !== "desktop-1200", "viewport is set by the test");
  planner.manyAlts(IZO, 4);
  await page.setViewportSize({ width: 1920, height: 1080 });
  await planner.open("/shopping");
  await expect(page.locator("tr.alt-strip-row").first()).toBeVisible();
  await expect(altHeaders(page)).toHaveCount(0);
  expectSideBySide(await firstStrip(page));
});

test("1440px Master Shopping keeps the Alt arts column and has no strip row (#1329)", async ({ page, planner }, testInfo) => {
  test.skip(testInfo.project.name !== "desktop-1200", "viewport is set by the test");
  planner.manyAlts(IZO, 4);
  await page.setViewportSize({ width: 1440, height: 900 });
  await planner.open("/shopping");
  await expect(altHeaders(page)).toHaveCount(1);
  await expect(page.locator("td.alt-arts-cell").first()).toBeVisible();
  await expect(page.locator("tr.alt-strip-row")).toHaveCount(0);
});

test("1920px Master Shopping with Show alt arts off has no strip rows (#1329)", async ({ page, planner }, testInfo) => {
  test.skip(testInfo.project.name !== "desktop-1200", "viewport is set by the test");
  planner.manyAlts(IZO, 4);
  await page.setViewportSize({ width: 1920, height: 1080 });
  await planner.open("/shopping");
  await expect(page.locator("tr.alt-strip-row").first()).toBeVisible();
  await page.getByRole("button", { name: /^Filters/ }).click();
  await page.getByLabel("Show alt arts").uncheck();
  await expect(page.locator("tr.alt-strip-row")).toHaveCount(0);
  await expect(page.locator("td.alt-arts-cell")).toHaveCount(0);
  await expect(page.locator(".data-table tbody tr").first()).toBeVisible();
});

test("1920px deck page: no Alt arts column, the alt tiles sit side by side under the card's numbers (#1329)", async ({ page, planner }, testInfo) => {
  test.skip(testInfo.project.name !== "desktop-1200", "viewport is set by the test");
  planner.manyAlts(IZO, 4);
  await page.setViewportSize({ width: 1920, height: 1080 });
  await planner.open(`/decks/${DECK_ID}`);
  await expect(page.locator("tr.alt-strip-row").first()).toBeVisible();
  await expect(altHeaders(page)).toHaveCount(0);
  expectSideBySide(await firstStrip(page));
});

test("1920px Collection: no Alt arts column, the alt tiles sit side by side under the card's numbers (#1329)", async ({ page, planner }, testInfo) => {
  test.skip(testInfo.project.name !== "desktop-1200", "viewport is set by the test");
  planner.manyAlts(IZO, 4);
  await page.setViewportSize({ width: 1920, height: 1080 });
  await planner.open("/collection");
  await expect(page.locator("tr.alt-strip-row").first()).toBeVisible();
  await expect(altHeaders(page)).toHaveCount(0);
  expectSideBySide(await firstStrip(page));
});
