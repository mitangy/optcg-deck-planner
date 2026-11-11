/**
 * Landscape phones: the right column and the Battle log overlay drag wider or narrower (#1246).
 * Own contexts (812x375 touch, 1280x720 desktop, 375x812 portrait), so it runs once, in the desktop project.
 */
import type { Browser, Page } from "@playwright/test";
import { test, expect } from "./fixtures";

test.beforeEach(({}, info) => {
  test.skip(info.project.name !== "desktop-1280", "sets its own viewports");
});

async function open(browser: Browser, baseURL: string | undefined, w: number, h: number, touch: boolean, path = "/demo") {
  const context = await browser.newContext({ baseURL, viewport: { width: w, height: h }, hasTouch: touch, isMobile: touch });
  const page = await context.newPage();
  await page.goto(path);
  await page.locator(".board-root").waitFor();
  await page.waitForTimeout(400);
  return { page, context };
}

const width = (page: Page, sel: string) => page.locator(sel).evaluate((el) => el.getBoundingClientRect().width);
// The hand lives in the right column on phones, so the board beside it gives up what the column takes.
const matRight = (page: Page) => page.locator(".playmat").evaluate((el) => el.getBoundingClientRect().right);

async function drag(page: Page, handle: string, dx: number) {
  const box = (await page.locator(handle).boundingBox())!;
  const x = box.x + box.width / 2;
  const y = box.y + box.height / 2;
  await page.mouse.move(x, y);
  await page.mouse.down();
  await page.mouse.move(x + dx / 2, y, { steps: 4 });
  await page.mouse.move(x + dx, y, { steps: 4 });
  await page.mouse.up();
  await page.waitForTimeout(100);
}

const RAIL = ".phone-resize-rail";
const OVERLAY = ".phone-resize-overlay";

test("dragging the right column's edge left widens it, the board beside it gives way, and it survives a reload (#1246)", async ({ browser, baseURL }) => {
  const { page, context } = await open(browser, baseURL, 812, 375, true);
  const w0 = await width(page, ".arena-rail");
  const mat0 = await matRight(page);
  await drag(page, RAIL, -60);
  expect(Math.abs((await width(page, ".arena-rail")) - (w0 + 60))).toBeLessThan(3);
  expect(Math.abs((await matRight(page)) - (mat0 - 60))).toBeLessThan(3);
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(812);
  const widened = await width(page, ".arena-rail");

  await page.reload();
  await page.locator(".board-root").waitFor();
  await page.waitForTimeout(400);
  expect(Math.abs((await width(page, ".arena-rail")) - widened)).toBeLessThan(2);

  // Dragging right narrows it again.
  await drag(page, RAIL, 40);
  expect(Math.abs((await width(page, ".arena-rail")) - (widened - 40))).toBeLessThan(3);
  await context.close();
});

test("the right column stops at its maximum and a double-click puts it back (#1246)", async ({ browser, baseURL }) => {
  const { page, context } = await open(browser, baseURL, 812, 375, true);
  const w0 = await width(page, ".arena-rail");
  await drag(page, RAIL, -600);
  // min(360px, 45vw) at 812px wide
  expect(await width(page, ".arena-rail")).toBeCloseTo(Math.min(360, 812 * 0.45), 0);
  await drag(page, RAIL, 600);
  expect(await width(page, ".arena-rail")).toBeCloseTo(140, 0);
  await page.locator(RAIL).dblclick();
  await page.waitForTimeout(100);
  expect(Math.abs((await width(page, ".arena-rail")) - w0)).toBeLessThan(2);
  await context.close();
});

test("Escape in the middle of a drag restores the width (#1246)", async ({ browser, baseURL }) => {
  const { page, context } = await open(browser, baseURL, 812, 375, true);
  const w0 = await width(page, ".arena-rail");
  const box = (await page.locator(RAIL).boundingBox())!;
  await page.mouse.move(box.x + 10, box.y + 40);
  await page.mouse.down();
  await page.mouse.move(box.x - 40, box.y + 40, { steps: 4 });
  expect(await width(page, ".arena-rail")).toBeGreaterThan(w0 + 30);
  await page.keyboard.press("Escape");
  await page.mouse.up();
  await page.waitForTimeout(100);
  expect(Math.abs((await width(page, ".arena-rail")) - w0)).toBeLessThan(2);
  await context.close();
});

test("the Battle log overlay widens from its right edge and stays open (#1246)", async ({ browser, baseURL }) => {
  const { page, context } = await open(browser, baseURL, 812, 375, true);
  await page.getByRole("button", { name: "Battle log" }).click();
  await page.locator(".lp-overlay").waitFor();
  const w0 = await width(page, ".lp-overlay");
  const rail0 = await width(page, ".arena-rail");
  await drag(page, OVERLAY, 80);
  await expect(page.locator(".lp-overlay")).toBeVisible();
  expect(Math.abs((await width(page, ".lp-overlay")) - (w0 + 80))).toBeLessThan(3);
  // The column behind it is untouched by an overlay drag.
  expect(Math.abs((await width(page, ".arena-rail")) - rail0)).toBeLessThan(2);
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(812);

  // Past the maximum: min(560px, 75vw) = 560 -> 609 at 812px wide, so 560.
  await drag(page, OVERLAY, 700);
  expect(await width(page, ".lp-overlay")).toBeCloseTo(Math.min(560, 812 * 0.75), 0);
  await page.locator(OVERLAY).dblclick();
  await page.waitForTimeout(100);
  expect(Math.abs((await width(page, ".lp-overlay")) - w0)).toBeLessThan(2);
  await expect(page.locator(".lp-overlay")).toBeVisible();
  await context.close();
});

test("arrow keys nudge the focused handle (#1246)", async ({ browser, baseURL }) => {
  const { page, context } = await open(browser, baseURL, 812, 375, true);
  const w0 = await width(page, ".arena-rail");
  await page.locator(RAIL).focus();
  await page.keyboard.press("ArrowLeft");
  await page.waitForTimeout(100);
  expect(Math.abs((await width(page, ".arena-rail")) - (w0 + 16))).toBeLessThan(2);
  await context.close();
});

test("desktop and portrait boards have no phone handles (#1246)", async ({ browser, baseURL }) => {
  for (const [w, h, touch] of [[1280, 720, false], [375, 812, true]] as const) {
    const { page, context } = await open(browser, baseURL, w, h, touch);
    await expect(page.locator(".phone-resize")).toHaveCount(0);
    await context.close();
  }
});
