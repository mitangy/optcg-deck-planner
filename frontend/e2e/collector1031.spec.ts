/**
 * Collector copies (#1031): Master Shopping shows a collector line under its card, the price popover adds one
 * (even at Still 0), and owning the printing fills it before it counts for decks.
 */
import type { Page } from "@playwright/test";
import { expect, test } from "./fixtures";

test.afterEach(({ planner }) => {
  expect(planner.errors).toEqual([]);
});

const SHOTS = process.env.PR_SHOTS_DIR;
const IZO = "EB01-002"; // need 4, owns 2 base, base $1.25
const GOLD = { product_id: 202, name: "Izo (Gold-stamped)", market_price: 30 };

const visibleLine = (page: Page) => page.locator("tr.collector-row:visible, .mobile-card.collector-card:visible, .collector-wrap:visible").first();
const shot = async (page: Page, testInfo: { project: { name: string } }, name: string) => {
  if (SHOTS) await page.screenshot({ path: `${SHOTS}/${name}-${testInfo.project.name}.png`, fullPage: false });
};

test("Master Shopping: a collector line sits under its card with Have 0 of 1 and a Remove undo (#1031)", async ({ page, planner }, testInfo) => {
  planner.addAlt(IZO, GOLD);
  planner.collectors.set(`${IZO}:202`, 1);
  await planner.open("/");
  const line = visibleLine(page);
  await expect(line).toBeVisible();
  await expect(line).toContainText("★ Collector");
  await expect(line).toContainText("Have 0 of 1");
  // The phone card drops this line to stay on one row.
  if (testInfo.project.name === "desktop-1200") await expect(line).toContainText("On top of Oden Red/Green");
  await expect(page.getByText("incl. 1 collector")).toBeVisible();
  await shot(page, testInfo, "line");

  // The line follows its card in the DOM order (table row or phone card right after the Izo row).
  const order = await page.locator("tr:visible, .mobile-card:visible").evaluateAll((els) => els.map((e) => (e.classList.contains("collector-row") || e.classList.contains("collector-card") ? "line" : (/EB01-\d+/.exec(e.textContent ?? "")?.[0] ?? "?"))));
  const at = order.indexOf("line");
  expect(at).toBeGreaterThan(0);
  expect(order[at - 1]).toBe(IZO);

  // The minus stops at 1; Remove deletes the line and Undo brings it back.
  await expect(page.getByRole("button", { name: "Want one fewer Izo (Gold-stamped) collector copy" }).first()).toBeDisabled();
  await page.getByRole("button", { name: "Want one more Izo (Gold-stamped) collector copy" }).first().click();
  await expect.poll(() => planner.collectors.get(`${IZO}:202`)).toBe(2);
  await page.getByRole("button", { name: /^Remove Izo \(Gold-stamped\) collector copy of EB01-002$/ }).first().click();
  await expect(page.getByRole("status").filter({ hasText: "Removed Izo (Gold-stamped) collector copy" })).toBeVisible();
  await expect.poll(() => planner.collectors.has(`${IZO}:202`)).toBe(false);
  await expect(page.locator("tr.collector-row:visible, .mobile-card.collector-card:visible")).toHaveCount(0);
  await shot(page, testInfo, "toast");
  await page.getByRole("button", { name: "Undo" }).click();
  await expect.poll(() => planner.collectors.get(`${IZO}:202`)).toBe(2);
  await expect(visibleLine(page)).toBeVisible();
});

test("Master Shopping: the price popover adds a collector copy even when nothing is left to buy (#1031)", async ({ page, planner }, testInfo) => {
  planner.addAlt(IZO, GOLD);
  planner.owned.set(IZO, 4);
  await planner.open("/");
  // Izo is covered (Still 0): the Still need filter hides it, so look at all cards.
  const showAll = page.getByRole("checkbox", { name: /still need/i });
  if (await showAll.count()) await showAll.uncheck();
  if (!(await page.locator(`[data-buy-split="${IZO}"]:visible`).count())) {
    await page.getByRole("button", { name: /^Filters/ }).click();
    await page.getByRole("checkbox", { name: /still need/i }).uncheck();
  }
  const trigger = page.locator(`[data-buy-split="${IZO}"]:visible`).first();
  await trigger.click();
  const dialog = page.getByRole("dialog", { name: "Buy Izo as" });
  await expect(dialog.getByRole("heading", { name: /every copy your decks need/ })).toBeVisible();
  await expect(dialog.getByRole("button", { name: /^Increase .* to buy$/ })).toHaveCount(0);
  await shot(page, testInfo, "popover");
  await dialog.getByRole("button", { name: "Pick Izo (Gold-stamped) as a collector copy" }).click();
  await expect.poll(() => planner.collectorPuts.map((p) => `${p.path}:${p.qty}`)).toEqual(["/cards/EB01-002/collector/202:1"]);
  await expect(dialog.getByText("★ Added")).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(visibleLine(page)).toContainText("Have 0 of 1");
});

test("Deck page: the card shows a +N collector chip and the alt tile a Collector mark (#1031)", async ({ page, planner }) => {
  planner.addAlt(IZO, GOLD);
  planner.collectors.set(`${IZO}:202`, 1);
  await planner.open("/decks/1");
  await expect(page.locator(".collector-chip-sm:visible").first()).toHaveText("★ +1 collector");
  // The gold-stamped tile carries the word with the star, never the star alone.
  await expect(page.getByRole("button", { name: "Remove Izo (Gold-stamped) collector copy" }).locator("visible=true").first()).toHaveText("★ Collector");
});
