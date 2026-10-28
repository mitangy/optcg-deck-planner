/**
 * Unfolded foldables and small touch tablets held sideways (#770): a landscape window 480-899px wide and 500px or
 * more tall, or a touch tablet 900-1099px wide, gets the side-rail layout (`arena-lp`) with real card sizes
 * instead of the stacked layout with tiny cards or the desktop side columns that shrink the mats. A mouse-driven
 * window of the same size stays the desktop layout. The viewports are set here, so the spec runs once (in the
 * desktop project).
 */
import { test, expect } from "./fixtures";
import type { Browser } from "@playwright/test";

test.beforeEach(({}, info) => {
  test.skip(info.project.name !== "desktop-1280", "sets its own viewports");
});

async function open(browser: Browser, baseURL: string | undefined, width: number, height: number, touch: boolean) {
  const context = await browser.newContext({ baseURL, viewport: { width, height }, hasTouch: touch });
  const page = await context.newPage();
  await page.goto("/demo");
  await page.locator(".board-root").waitFor();
  // The board lays out in a frame or two after the media queries settle.
  await page.waitForTimeout(400);
  const m = await page.evaluate(() => ({
    cls: document.querySelector(".board-root")!.className,
    card: document.querySelector(".side-you .characters-row .card-tile")!.getBoundingClientRect().width,
    scrollW: document.documentElement.scrollWidth,
  }));
  await context.close();
  return m;
}

test("A touch window 890x626 (unfolded foldable) gets the rail layout with readable cards (#770)", async ({ browser, baseURL }) => {
  const m = await open(browser, baseURL, 890, 626, true);
  expect(m.cls).toMatch(/arena-lp/);
  expect(m.card, "own Character card width").toBeGreaterThanOrEqual(60);
  expect(m.scrollW).toBe(890);
});

for (const [w, h] of [
  [951, 543],
  [1024, 768],
]) {
  test(`A touch window ${w}x${h} gets the rail layout (#770)`, async ({ browser, baseURL }) => {
    const m = await open(browser, baseURL, w, h, true);
    expect(m.cls).toMatch(/arena-lp/);
    expect(m.scrollW).toBe(w);
  });
}

test("A mouse window 1024x768 keeps the desktop layout (#770)", async ({ browser, baseURL }) => {
  const m = await open(browser, baseURL, 1024, 768, false);
  expect(m.cls).toMatch(/arena-wide/);
  expect(m.cls).not.toMatch(/arena-lp/);
  expect(m.scrollW).toBe(1024);
});
