/**
 * Collector copies from the alt tiles (#1035): the deck page tile toggles a collector copy, Master Shopping shows it
 * (same per-user want), and the pressed toggle there removes it again.
 */
import { expect, test } from "./fixtures";

test.afterEach(({ planner }) => {
  expect(planner.errors).toEqual([]);
});

const IZO = "EB01-002";
const GOLD = { product_id: 202, name: "Izo (Gold-stamped)", market_price: 30 };
const collectLine = (page: import("@playwright/test").Page) =>
  page.locator("tr.collector-row:visible, .mobile-card.collector-card:visible, .collector-wrap:visible").first();

test("Deck page: Collect on an alt tile shows up as a collector line in Master Shopping (#1035)", async ({ page, planner }) => {
  planner.addAlt(IZO, GOLD);
  await planner.open("/decks/1");
  const collect = page.getByRole("button", { name: "Want Izo (Gold-stamped) as a collector copy" }).locator("visible=true").first();
  await expect(collect).toHaveAttribute("aria-pressed", "false");
  await collect.click();
  await expect.poll(() => planner.collectorPuts.map((p) => `${p.path}:${p.qty}`)).toEqual(["/cards/EB01-002/collector/202:1"]);
  await expect(page.getByRole("button", { name: "Remove Izo (Gold-stamped) collector copy" }).locator("visible=true").first()).toHaveAttribute("aria-pressed", "true");

  await planner.open("/");
  await expect(collectLine(page)).toContainText("★ Collector");
  await expect(collectLine(page)).toContainText("Have 0 of 1");
});

test("Master Shopping: the pressed collector toggle on the alt tile removes the collector copy (#1035)", async ({ page, planner }) => {
  planner.addAlt(IZO, GOLD);
  planner.collectors.set(`${IZO}:202`, 1);
  await planner.open("/");
  await expect(collectLine(page)).toBeVisible();
  await page.getByRole("button", { name: "Remove Izo (Gold-stamped) collector copy" }).locator("visible=true").first().click();
  await expect.poll(() => planner.collectors.has(`${IZO}:202`)).toBe(false);
  await expect(page.locator("tr.collector-row:visible, .mobile-card.collector-card:visible")).toHaveCount(0);
});
