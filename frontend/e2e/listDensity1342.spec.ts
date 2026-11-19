import type { Page } from "@playwright/test";
import { expect, test } from "./fixtures";

test.afterEach(({ planner }) => {
  expect(planner.errors).toEqual([]);
});

const IZO = "EB01-002";

/** Visible list rows (table rows or phone cards) whose top edge is inside the viewport, and the first one's top. */
const rowsInView = (page: Page) =>
  page.evaluate(() => {
    const rows = [...document.querySelectorAll<HTMLElement>("tbody tr[data-card-id], tbody tr:has(td.select-col), .mobile-card")].filter((e) => e.offsetParent);
    const tops = rows.map((e) => Math.round(e.getBoundingClientRect().top));
    return { count: tops.filter((t) => t < window.innerHeight).length, first: tops[0] ?? -1, height: rows[0] ? Math.round(rows[0].getBoundingClientRect().height) : 0 };
  });

async function stableRows(page: Page) {
  let last = -2;
  await expect
    .poll(async () => {
      const now = (await rowsInView(page)).first;
      const same = now === last && now > 0;
      last = now;
      return same;
    })
    .toBe(true);
  return rowsInView(page);
}

test("Compact is the default on Shopping and fits many more rows on screen than Comfortable (#1342)", async ({ page, planner }, info) => {
  test.skip(info.project.name !== "desktop-1200", "desktop rows");
  planner.defaultDensity = true;
  planner.manyCards(30);
  await page.setViewportSize({ width: 1440, height: 900 });
  await planner.open("/shopping");
  await expect(page.getByRole("group", { name: "List density" }).getByRole("button", { name: "Compact" })).toHaveAttribute("aria-pressed", "true");
  const compact = await stableRows(page);
  expect(compact.count).toBeGreaterThanOrEqual(8);
  expect(compact.height).toBeLessThanOrEqual(72);

  await page.setViewportSize({ width: 1280, height: 720 });
  const small = await stableRows(page);
  expect(small.count).toBeGreaterThanOrEqual(5);

  await page.setViewportSize({ width: 1440, height: 900 });
  await page.getByRole("group", { name: "List density" }).getByRole("button", { name: "Comfortable" }).click();
  const comfortable = await stableRows(page);
  expect(comfortable.count).toBeLessThanOrEqual(3);
  // the choice is remembered
  await page.reload();
  await expect(page.getByRole("group", { name: "List density" }).getByRole("button", { name: "Comfortable" })).toHaveAttribute("aria-pressed", "true");
});

test("the alt chip opens that row's alt tiles under it without moving the chip, and closes them again (#1342)", async ({ page, planner }, info) => {
  test.skip(info.project.name !== "desktop-1200", "desktop rows");
  planner.defaultDensity = true;
  await planner.open("/shopping");
  const row = page.locator("tbody tr", { has: page.getByText(IZO, { exact: true }) }).first();
  const chip = row.getByRole("button", { name: /1 alt/ });
  await expect(chip).toHaveAttribute("aria-expanded", "false");
  await expect(page.locator(".alt-art:visible")).toHaveCount(0);
  const before = await chip.boundingBox();
  await chip.click();
  await expect(chip).toHaveAttribute("aria-expanded", "true");
  const tray = page.locator("tr.alt-strip-row");
  await expect(tray).toHaveCount(1);
  await expect(tray.locator(".alt-art")).toHaveCount(2); // Base + the Alternate Art
  expect(await chip.boundingBox()).toEqual(before);
  await chip.click();
  await expect(tray).toHaveCount(0);
});

test("a card with alt arts shows its total owned and a base/alt breakdown, no stepper in the Owned column (#1380)", async ({ page, planner }, info) => {
  test.skip(info.project.name !== "desktop-1200", "desktop rows");
  planner.defaultDensity = true;
  planner.altOwned.set(`${IZO}:201`, 1);
  await planner.open("/shopping");
  const row = page.locator("tbody tr", { has: page.getByText(IZO, { exact: true }) }).first();
  const base = planner.owned.get(IZO) ?? 0;
  await expect(row.getByRole("img", { name: `${base + 1} owned in total` })).toBeVisible();
  await expect(row.locator(".alts-owned-note")).toHaveText(`${base} base · 1 alt`);
  await expect(row.getByRole("button", { name: "Increase owned", exact: true })).toHaveCount(0);
});

test("Compact phone cards are about half the height of Comfortable ones, with the alts behind a chip (#1342)", async ({ page, planner }, info) => {
  test.skip(info.project.name !== "phone-375", "phone cards");
  planner.defaultDensity = true;
  await planner.open("/shopping");
  const compact = await stableRows(page);
  const chip = page.locator(".mobile-card").first().getByRole("button", { name: /alt/ });
  await expect(chip).toBeVisible();
  await page.getByRole("group", { name: "List density" }).getByRole("button", { name: "Comfortable" }).click();
  const comfortable = await stableRows(page);
  expect(compact.height).toBeLessThan(comfortable.height * 0.65);
  expect(compact.height).toBeLessThan(210);
});

test("Shopping Compact list shows no clipped column at 1200 (#1342)", async ({ page, planner }, info) => {
  test.skip(info.project.name !== "desktop-1200", "desktop table");
  planner.defaultDensity = true;
  await planner.open("/shopping");
  await expect(page.locator(".table-wrap.density-compact")).toBeVisible();
  const overflow = await page.evaluate(() => {
    const wrap = document.querySelector<HTMLElement>(".table-wrap.density-compact")!;
    const last = [...wrap.querySelectorAll<HTMLElement>("thead th")].pop()!;
    return { clipped: Math.round(last.getBoundingClientRect().right - wrap.getBoundingClientRect().right), scroll: wrap.scrollWidth - wrap.clientWidth };
  });
  expect(overflow.scroll).toBeLessThanOrEqual(0);
  expect(overflow.clipped).toBeLessThanOrEqual(0);
});

test("phone colour and type chips stay on one row that scrolls (#1342)", async ({ page, planner }, info) => {
  test.skip(info.project.name !== "phone-375", "phone toolbar");
  await planner.open("/shopping");
  const colors = page.getByRole("group", { name: "Colors" });
  const types = page.getByRole("group", { name: "Card type" });
  await expect(colors).toBeVisible();
  const [c, t] = await Promise.all([colors.boundingBox(), types.boundingBox()]);
  expect(Math.abs(c!.y - t!.y), "colour dots and type chips share a row").toBeLessThan(8);
  const row = await page.locator(".toolbar-chip-scroll").evaluate((e) => ({ h: e.getBoundingClientRect().height, sideways: document.documentElement.scrollWidth - innerWidth }));
  expect(row.h).toBeLessThan(60);
  expect(row.sideways).toBeLessThanOrEqual(0);
});
