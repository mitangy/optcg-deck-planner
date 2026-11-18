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

for (const path of ["/shopping", "/collection", `/decks/${DECK_ID}`]) {
  test(`${path} Grid at 2560px: no card content overflows its tile (#1329)`, async ({ page, planner }, testInfo) => {
    test.skip(testInfo.project.name !== "desktop-1200", "viewport is set by the test");
    await page.setViewportSize({ width: 2560, height: 1440 });
    await planner.open(path);
    await page.getByRole("button", { name: "Grid", exact: true }).click();
    const tiles = page.locator(".grid-card").filter({ visible: true });
    await expect(tiles.first()).toBeVisible();
    const over = await tiles.evaluateAll((els) =>
      els.flatMap((el) => {
        const e = el as HTMLElement;
        const tile = e.getBoundingClientRect();
        const wide = Array.from(e.querySelectorAll<HTMLElement>("*")).filter(
          (c) =>
            getComputedStyle(c).position !== "absolute" &&
            !c.closest(".copies-badge") &&
            (c.getBoundingClientRect().right > tile.right + 1 || (c.childElementCount === 0 && c.scrollWidth > c.clientWidth + 1)),
        );
        return wide.slice(0, 1).map((c) => `${e.dataset.cardId}: ${c.className || c.tagName}`);
      }),
    );
    expect(over).toEqual([]);
  });
}

test("price history chart axis labels keep their 10px size at 2560px (#1329)", async ({ page, planner }, testInfo) => {
  test.skip(testInfo.project.name !== "desktop-1200", "viewport is set by the test");
  await page.setViewportSize({ width: 2560, height: 1440 });
  await planner.open("/collection");
  await page.locator('[data-card-id="EB01-002"]:visible').locator("img.thumb").first().click();
  const lightbox = page.getByRole("dialog", { name: "Expanded card art" });
  await lightbox.getByRole("button", { name: "Price history" }).click();
  const axis = lightbox.getByRole("region", { name: "Price history" }).locator("text.ph-axis").first();
  await expect(axis).toBeVisible();
  // The SVG already scales with its box, so a rem size would scale the labels twice.
  expect(await axis.evaluate((el) => getComputedStyle(el).fontSize)).toBe("10px");
});
