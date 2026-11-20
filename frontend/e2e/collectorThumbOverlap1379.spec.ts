import type { Page } from "@playwright/test";
import { expect, test } from "./fixtures";

test.afterEach(({ planner }) => {
  expect(planner.errors).toEqual([]);
});

const SHOTS = process.env.PR_SHOTS_DIR;
const IZO = "EB01-002";
const GOLD = { product_id: 202, name: "Izo (Gold-stamped)", market_price: 30 };

const setDensity = (page: Page, name: "Compact" | "Comfortable") => page.getByRole("group", { name: "List density" }).getByRole("button", { name }).click();

test("Phone Shopping compact: collector copy thumbnail does not overlap its text (#1379)", async ({ page, planner }, info) => {
  test.skip(info.project.name !== "phone-375", "phone collector sub-row");
  planner.addAlt(IZO, GOLD);
  planner.collectors.set(`${IZO}:202`, 1);
  await planner.open("/shopping");
  const line = page.locator(".mobile-card.collector-card:visible").first();
  await expect(line).toBeVisible();

  for (const density of ["Comfortable", "Compact"] as const) {
    await setDensity(page, density);
    await expect(page.getByRole("group", { name: "List density" }).getByRole("button", { name: density })).toHaveAttribute("aria-pressed", "true");
    await expect(line).toBeVisible();
    const thumb = await line.locator(".collector-thumb-wrap .thumb").first().boundingBox();
    const wrap = await line.locator(".collector-thumb-wrap").first().boundingBox();
    const text = await line.locator(".collector-card-text").first().boundingBox();
    expect(thumb && wrap && text, `${density}: thumb, wrap and text are laid out`).toBeTruthy();
    expect(thumb!.x + thumb!.width, `${density}: thumb right edge vs text left edge`).toBeLessThanOrEqual(text!.x + 0.5);
    expect(thumb!.width, `${density}: thumb stays inside its wrap`).toBeLessThanOrEqual(wrap!.width + 0.5);
    if (SHOTS) await line.scrollIntoViewIfNeeded().then(() => page.screenshot({ path: `${SHOTS}/collector-thumb-${density.toLowerCase()}-${info.project.name}.png` }));
  }
});
