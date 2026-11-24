import type { Page } from "@playwright/test";
import { expect, test, DECK_ID } from "./fixtures";

const IZO = "EB01-002"; // 1 alt + 4 more = 5 alt arts + Base: 6 tiles, spans 3

test.afterEach(({ planner }) => {
  expect(planner.errors).toEqual([]);
});

const PAGES = [
  { name: "Shopping", path: "/shopping", two: "EB01-003", plain: "EB01-009" },
  { name: "deck page", path: `/decks/${DECK_ID}`, two: "EB01-003", plain: "EB01-009" },
  { name: "Collection", path: "/collection", two: "EB01-006", plain: "EB01-001" },
];

async function openGrid(page: Page, planner: { open(path: string): Promise<void> }, path: string, plain: string, width: number) {
  await page.setViewportSize({ width, height: 1080 });
  await planner.open(path);
  await page.getByRole("button", { name: "Grid", exact: true }).click();
  await expect(card(page, plain)).toBeVisible();
}

const card = (page: Page, id: string) => page.locator(".card-grid .grid-card").filter({ has: page.locator(`.card-id:text-is("${id}")`) });
const width = async (page: Page, id: string) => (await card(page, id).boundingBox())!.width;

for (const { name, path, two, plain } of PAGES) {
  test(`1920px ${name} Grid: a card with alts spans 2 columns, 3 with 5+ tiles, a plain card stays 1 (#1333)`, async ({ page, planner }, testInfo) => {
    test.skip(testInfo.project.name !== "desktop-1200", "viewport is set by the test");
    planner.manyAlts(IZO, 4);
    planner.manyAlts(two, 1);
    await openGrid(page, planner, path, plain, 1920);
    const one = await width(page, plain);
    expect(await width(page, two)).toBeGreaterThan(one * 1.8);
    expect(await width(page, two)).toBeLessThan(one * 2.3);
    expect(await width(page, IZO)).toBeGreaterThan(one * 2.7);
    expect(await width(page, IZO)).toBeLessThan(one * 3.3);
  });

  test(`1920px ${name} Grid: the alt tiles sit side by side in a tray beside the card (#1333)`, async ({ page, planner }, testInfo) => {
    test.skip(testInfo.project.name !== "desktop-1200", "viewport is set by the test");
    planner.manyAlts(IZO, 4);
    planner.manyAlts(two, 1);
    await openGrid(page, planner, path, plain, 1920);
    const izo = card(page, IZO);
    const tiles = await izo.locator(".alt-art").evaluateAll((els) => els.map((e) => e.getBoundingClientRect().toJSON()));
    expect(tiles.length).toBe(6);
    expect(tiles[1].top).toBeCloseTo(tiles[0].top, 0);
    expect(tiles[1].left).toBeGreaterThan(tiles[0].right);
    const art = (await izo.locator(".grid-card-media, .collection-tile-art").first().boundingBox())!;
    expect(tiles[0].left).toBeGreaterThan(art.x + art.width);
    const label = await izo.locator(".alt-tray-label").innerText();
    expect(label.replace(/\s+/g, " ").trim().toLowerCase()).toBe("alt arts · 6");
  });

  test(`1599px ${name} Grid: nothing spans and there is no tray (#1333)`, async ({ page, planner }, testInfo) => {
    test.skip(testInfo.project.name !== "desktop-1200", "viewport is set by the test");
    planner.manyAlts(IZO, 4);
    planner.manyAlts(two, 1);
    await openGrid(page, planner, path, plain, 1599);
    const one = await width(page, plain);
    expect(await width(page, IZO)).toBeLessThan(one * 1.2);
    expect(await width(page, two)).toBeLessThan(one * 1.2);
    await expect(page.locator(".alt-tray")).toHaveCount(0);
  });

  test(`1920px ${name} Grid with Show alt arts off: no card spans (#1333)`, async ({ page, planner }, testInfo) => {
    test.skip(testInfo.project.name !== "desktop-1200", "viewport is set by the test");
    planner.manyAlts(IZO, 4);
    planner.manyAlts(two, 1);
    await openGrid(page, planner, path, plain, 1920);
    const toggle = page.getByRole("checkbox", { name: "Show alt arts" });
    if (!(await toggle.isVisible())) await page.getByRole("button", { name: /Filters/ }).click();
    await toggle.uncheck();
    await expect(page.locator(".alt-art")).toHaveCount(0);
    const one = await width(page, plain);
    expect(await width(page, IZO)).toBeLessThan(one * 1.2);
    expect(await width(page, two)).toBeLessThan(one * 1.2);
  });

  test(`${name} Grid: no sideways scroll at 1600px and 2560px, and the cards keep their sort order (#1333)`, async ({ page, planner }, testInfo) => {
    test.skip(testInfo.project.name !== "desktop-1200", "viewport is set by the test");
    planner.manyAlts(IZO, 4);
    planner.manyAlts(two, 4);
    await openGrid(page, planner, path, plain, 1600);
    for (const w of [1600, 1700, 1800, 1920, 2200, 2560]) {
      await page.setViewportSize({ width: w, height: 1080 });
      await expect(card(page, IZO)).toBeVisible();
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
      const fits = await page.locator(".card-grid").evaluate((grid) => {
        const g = grid.getBoundingClientRect();
        return Array.from(grid.children).every((c) => {
          const r = c.getBoundingClientRect();
          return r.left >= g.left - 1 && r.right <= g.right + 1;
        });
      });
      expect(fits, `cards inside the grid at ${w}px`).toBe(true);
      const boxes = await page.locator(".card-grid .grid-card").evaluateAll((els) => els.map((e) => e.getBoundingClientRect().toJSON()));
      for (let i = 1; i < boxes.length; i++) {
        const a = boxes[i - 1];
        const b = boxes[i];
        expect(b.top > a.top + 1 || (Math.abs(b.top - a.top) <= 1 && b.left > a.left), `card ${i} follows card ${i - 1} at ${w}px`).toBe(true);
      }
    }
  });
}

for (const { name, path, two, plain } of PAGES) {
  test(`${name} Grid: a span never asks for more columns than the grid has (#1333)`, async ({ page, planner }, testInfo) => {
    test.skip(testInfo.project.name !== "desktop-1200", "viewport is set by the test");
    planner.manyAlts(IZO, 4);
    planner.manyAlts(two, 1);
    await openGrid(page, planner, path, plain, 2560);
    const grid = page.locator(".card-grid");
    for (const [rem, maxSpan] of [[20, 1], [35, 2], [60, 3]] as const) {
      await grid.evaluate((g, r) => (g.style.width = `${r}rem`), rem);
      const one = await width(page, plain);
      const out = await grid.evaluate((g) => {
        const box = g.getBoundingClientRect();
        return Array.from(g.children).filter((c) => c.getBoundingClientRect().right > box.right + 1 || c.getBoundingClientRect().left < box.left - 1).length;
      });
      expect(out, `cards outside a ${rem}rem grid`).toBe(0);
      expect(await width(page, IZO), `Izo in a ${rem}rem grid`).toBeLessThan(one * (maxSpan + 0.4));
    }
  });
}
