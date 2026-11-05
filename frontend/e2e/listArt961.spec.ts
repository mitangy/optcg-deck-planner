/**
 * List view card art (#961): in the desktop tables the main art fills the Card column and the
 * card id / name / TCGPlayer link sit under it, without the table scrolling sideways.
 */
import { expect, test } from "./fixtures";

test.afterEach(({ planner }) => {
  expect(planner.errors).toEqual([]);
});

test("Shopping list puts the card text under a large main art without sideways scroll (#961)", async ({ page, planner }, testInfo) => {
  test.skip(testInfo.project.name !== "desktop-1200", "the table is desktop only");
  await planner.open("/");
  const row = page.locator(".desktop-table tbody tr", { hasText: "EB01-003" });
  await expect(row.locator(".card-cell .thumb-btn")).toBeVisible();
  const geo = await row.evaluate((r) => {
    const cell = r.querySelector(".card-cell")!;
    const art = cell.querySelector(".thumb-btn")!.getBoundingClientRect();
    const text = cell.querySelector(".card-id")!.getBoundingClientRect();
    const wrap = r.closest(".table-wrap")!;
    return { artW: art.width, artH: art.height, artBottom: art.bottom, textTop: text.top, fits: wrap.scrollWidth <= wrap.clientWidth };
  });
  expect(geo.textTop).toBeGreaterThanOrEqual(geo.artBottom);
  expect(geo.artW).toBeGreaterThanOrEqual(160);
  expect(geo.artH / geo.artW).toBeCloseTo(88 / 63, 1);
  expect(geo.fits).toBe(true);
});
