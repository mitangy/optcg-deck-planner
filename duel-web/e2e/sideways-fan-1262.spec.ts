/**
 * Big screens held sideways (#1262): unfolded foldables (iPhone Duo) and touch tablets in the landscape rail
 * layout fan the hand off the bottom of the board when Hand layout is Fan. The mats keep a strip free for the
 * tucked cards and End turn stays at the bottom of the right column. Shorter phones held sideways and
 * Automatic keep the hand in the right column. The viewports are set here, so the spec runs once (in the
 * desktop project).
 */
import { test, expect } from "./fixtures";
import type { Browser } from "@playwright/test";

test.beforeEach(({}, info) => {
  test.skip(info.project.name !== "desktop-1280", "sets its own viewports");
});

async function open(browser: Browser, baseURL: string | undefined, width: number, height: number, handLayout: string) {
  const context = await browser.newContext({ baseURL, viewport: { width, height }, hasTouch: true, isMobile: true });
  const page = await context.newPage();
  await page.addInitScript((l) => localStorage.setItem("optcg-duel:settings", JSON.stringify({ handLayout: l })), handLayout);
  await page.goto("/demo");
  await page.locator(".board-root").waitFor();
  // The board lays out in a frame or two after the media queries settle; the fan tucks after its transition.
  await page.waitForTimeout(800);
  const m = await page.evaluate(() => {
    const box = (s: string) => document.querySelector(s)?.getBoundingClientRect() ?? null;
    return {
      cls: document.querySelector(".board-root")!.className,
      fanCards: box(".hand-fan .hand-fan-cards"),
      railHand: box(".rail-hand"),
      mat: box(".side-you"),
      intent: box(".arena-rail .intent-bar"),
      scrollW: document.documentElement.scrollWidth,
    };
  });
  return { m, page, context };
}

for (const [w, h] of [
  [890, 626],
  [951, 543],
  [1024, 768],
]) {
  test(`a ${w}x${h} touch screen held sideways fans the hand under the board with Fan picked (#1262)`, async ({ browser, baseURL }) => {
    const { m, context } = await open(browser, baseURL, w, h, "fan");
    expect(m.cls).toMatch(/arena-lp/);
    expect(m.fanCards, "fanned hand").not.toBeNull();
    expect(m.railHand, "right-column hand").toBeNull();
    // The tucked cards sit in the strip under the mats, not over your bottom row.
    expect(m.mat!.bottom).toBeLessThanOrEqual(m.fanCards!.top + 1);
    // End turn stays at the bottom of the right column.
    expect(m.intent!.bottom).toBeGreaterThanOrEqual(h - 2);
    expect(m.scrollW).toBe(w);
    await context.close();
  });
}

test("tapping Hand raises the sideways fan (#1262)", async ({ browser, baseURL }) => {
  const { m, page, context } = await open(browser, baseURL, 890, 626, "fan");
  await page.locator(".hand-fan-toggle").tap();
  await page.waitForTimeout(500);
  const raised = await page.locator(".hand-fan-cards").boundingBox();
  expect(raised!.y + raised!.height, "raised fan fully on screen").toBeLessThanOrEqual(626 + 1);
  expect(raised!.y).toBeLessThan(m.fanCards!.top - 40);
  await context.close();
});

test("a short phone held sideways keeps the hand in the right column even with Fan picked (#1262)", async ({ browser, baseURL }) => {
  const { m, context } = await open(browser, baseURL, 812, 375, "fan");
  expect(m.cls).toMatch(/arena-lp/);
  expect(m.railHand).not.toBeNull();
  expect(m.fanCards).toBeNull();
  await context.close();
});

test("Automatic keeps the hand in the right column on a big screen held sideways (#1262)", async ({ browser, baseURL }) => {
  const { m, context } = await open(browser, baseURL, 890, 626, "auto");
  expect(m.railHand).not.toBeNull();
  expect(m.fanCards).toBeNull();
  await context.close();
});

async function keepOpenRow(browser: Browser, baseURL: string | undefined, width: number, height: number) {
  const context = await browser.newContext({ baseURL, viewport: { width, height }, hasTouch: true, isMobile: true });
  const page = await context.newPage();
  await page.addInitScript(() => localStorage.setItem("optcg-duel:settings", JSON.stringify({ handLayout: "fan" })));
  await page.goto("/settings");
  await page.locator("#hand-layout").waitFor();
  const row = page.locator(".switch", { hasText: "Keep hand open" });
  const r = { count: await row.count(), disabled: (await row.count()) ? await row.locator("input").isDisabled() : null };
  await context.close();
  return r;
}

test("Settings lists Keep hand open grayed out on an unfolded iPhone Duo held upright (#1262)", async ({ browser, baseURL }) => {
  expect(await keepOpenRow(browser, baseURL, 669, 825)).toEqual({ count: 1, disabled: true });
});

test("Settings keeps Keep hand open usable on an unfolded iPhone Duo held sideways with Fan picked (#1262)", async ({ browser, baseURL }) => {
  expect(await keepOpenRow(browser, baseURL, 890, 626)).toEqual({ count: 1, disabled: false });
});

test("Settings leaves Keep hand open off a phone too small to fan the hand, upright or sideways (#1262)", async ({ browser, baseURL }) => {
  expect((await keepOpenRow(browser, baseURL, 375, 812)).count).toBe(0);
  expect((await keepOpenRow(browser, baseURL, 812, 375)).count).toBe(0);
});
