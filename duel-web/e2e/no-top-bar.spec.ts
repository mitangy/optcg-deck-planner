/**
 * No top bar with Bigger playing area on a computer (#468): the board takes the whole window height, and the bar's
 * buttons (Brief, Log Pose, Undo, the ⋯ match menu) move to a row at the top of a side column. F toggles full
 * screen. The viewports are set here, so the spec runs once (in the desktop project).
 */
import { test, expect, FAKE_API } from "./fixtures";
import type { Page } from "@playwright/test";

test.beforeEach(({}, info) => {
  test.skip(info.project.name !== "desktop-1280", "sets its own viewports");
});

const DESKTOP = { width: 1280, height: 720 };

async function openDemo(page: Page, vp: { width: number; height: number }, settings: Record<string, unknown>, query = "") {
  await page.setViewportSize(vp);
  await page.addInitScript((s) => localStorage.setItem("optcg-duel:settings", JSON.stringify(s)), settings);
  await page.goto(`/demo${query}`);
  await page.locator(".board-root").waitFor();
  // The board lays out in a frame or two after the media queries settle.
  await page.waitForTimeout(400);
}

const top = (page: Page, selector: string) =>
  page.evaluate((sel) => document.querySelector(sel)!.getBoundingClientRect().top, selector);

test("Bigger playing area on a computer has no top bar and the board starts at the top of the window (#468)", async ({ page }) => {
  await openDemo(page, DESKTOP, { bigBoard: true });
  await expect(page.locator(".hud-bar")).toHaveCount(0);
  expect(await top(page, ".playmat")).toBeLessThanOrEqual(4);
  expect(await top(page, ".arena-body")).toBeLessThanOrEqual(1);

  // The bar's buttons ride in a row at the top of the right column.
  const row = page.locator(".arena-rail > .col-actions");
  await expect(row).toBeVisible();
  await expect(row.getByRole("button", { name: "Match menu" })).toBeVisible();
  const box = (await row.boundingBox())!;
  const rail = (await page.locator(".arena-rail").boundingBox())!;
  expect(box.y).toBeLessThanOrEqual(1);
  expect(box.x).toBeGreaterThanOrEqual(rail.x - 1);
  expect(box.x + box.width).toBeLessThanOrEqual(rail.x + rail.width + 1);
  // Right-aligned: the menu button is at the column's right edge.
  const menuBtn = (await row.getByRole("button", { name: "Match menu" }).boundingBox())!;
  expect(rail.x + rail.width - (menuBtn.x + menuBtn.width)).toBeLessThan(20);
  // Nothing scrolls the page.
  expect(await page.evaluate(() => document.documentElement.scrollHeight)).toBeLessThanOrEqual(DESKTOP.height);
});

test("the top bar is still there on a computer without Bigger playing area (#468)", async ({ page }) => {
  await openDemo(page, DESKTOP, {});
  await expect(page.locator(".hud-bar")).toBeVisible();
  await expect(page.locator(".col-actions")).toHaveCount(0);
  expect(await top(page, ".playmat")).toBeGreaterThan(30);
});

test("the match menu opens right under its button, fully on screen, with Leave match, Concede and Settings (#468)", async ({ page }) => {
  await openDemo(page, DESKTOP, { bigBoard: true });
  const trigger = page.getByRole("button", { name: "Match menu" });
  await trigger.click();
  const menu = page.getByRole("menu", { name: "Match menu" });
  await expect(menu).toBeVisible();
  for (const name of [/Leave match/, /Concede/, /Gameplay settings/]) {
    await expect(menu.getByRole("menuitem", { name }).or(menu.getByRole("button", { name }))).toBeVisible();
  }
  const m = (await menu.boundingBox())!;
  const t = (await trigger.boundingBox())!;
  expect(m.x).toBeGreaterThanOrEqual(0);
  expect(m.y).toBeGreaterThanOrEqual(0);
  expect(m.x + m.width).toBeLessThanOrEqual(DESKTOP.width);
  expect(m.y + m.height).toBeLessThanOrEqual(DESKTOP.height);
  // Just under the button, not at the old top-bar spot.
  expect(m.y - (t.y + t.height)).toBeGreaterThanOrEqual(0);
  expect(m.y - (t.y + t.height)).toBeLessThanOrEqual(12);
  // Opening it moves nothing.
  expect((await trigger.boundingBox())!).toEqual(t);
  // It opens Settings like the old bar's gear did.
  await menu.getByRole("menuitem", { name: /Gameplay settings/ }).click();
  await expect(page.getByRole("dialog", { name: "Gameplay settings" })).toBeVisible();
});

test("with the right column empty the action row moves to the left column and its menu stays on screen (#468)", async ({ page }) => {
  await openDemo(page, DESKTOP, { bigBoard: true, panelLayout: "preview,recent,log,oppHand,turn,hand,chat|" });
  await expect(page.locator(".hud-bar")).toHaveCount(0);
  const row = page.locator(".arena-left > .col-actions");
  await expect(row).toBeVisible();
  await expect(page.locator(".arena-rail .col-actions")).toHaveCount(0);
  expect(((await row.boundingBox())!).y).toBeLessThanOrEqual(1);

  const trigger = row.getByRole("button", { name: "Match menu" });
  await trigger.click();
  const t = (await trigger.boundingBox())!;
  const m = (await page.getByRole("menu", { name: "Match menu" }).boundingBox())!;
  // Under its own button, not at the right edge of the window where the old top bar's menu opened.
  expect(m.x).toBeLessThan(t.x + t.width);
  expect(m.y - (t.y + t.height)).toBeLessThanOrEqual(12);
  expect(m.x).toBeGreaterThanOrEqual(0);
  expect(m.x + m.width).toBeLessThanOrEqual(DESKTOP.width);
  expect(m.y + m.height).toBeLessThanOrEqual(DESKTOP.height);
});

test("a portrait phone keeps its compact top bar with Bigger playing area on (#468)", async ({ page }) => {
  await openDemo(page, { width: 375, height: 812 }, { bigBoard: true });
  await expect(page.locator(".hud-bar.hud-compact")).toBeVisible();
  await expect(page.locator(".col-actions")).toHaveCount(0);
});

test("F toggles full screen on the board, with or without Bigger playing area (#468)", async ({ page }) => {
  for (const settings of [{ bigBoard: true }, { bigBoard: false, bigBoardChosen: true }]) {
    await openDemo(page, DESKTOP, settings);
    const inFullscreen = () => page.evaluate(() => document.fullscreenElement != null);
    test.skip(!(await page.evaluate(() => document.fullscreenEnabled)), "this browser has no Fullscreen API");
    expect(await inFullscreen()).toBe(false);
    await page.keyboard.press("f");
    await expect.poll(inFullscreen).toBe(true);
    await page.keyboard.press("Shift+F");
    await expect.poll(inFullscreen).toBe(false);
  }
});

// The narrowest side column (#796): every toolbar button stays inside the row, and Full screen has its own button.
// A real practice game (hot-seat), so Brief, Log Pose and the "→ P2" switch are all there.
const ANALYST = "http://127.0.0.1:8766";
const CORS = {
  "access-control-allow-origin": process.env.E2E_PAGE_ORIGIN ?? "http://127.0.0.1:5174",
  "access-control-allow-credentials": "true",
  "access-control-allow-headers": "authorization, content-type, accept",
  "access-control-allow-methods": "POST, OPTIONS",
};

for (const width of [180, 200, 250]) {
  test(`every button in the action row fits a ${width}px side column and Full screen sits in the row, not the menu (#796)`, async ({ page, duel }) => {
    await page.setViewportSize(DESKTOP);
    await page.addInitScript((w) => {
      const s = { bigBoard: true, matchBrief: true, logPoseCopilot: true, panelSizesBig: `R=${w}` };
      const key = "optcg-duel:settings";
      const apply = () => localStorage.setItem(key, JSON.stringify(s));
      const clear = Storage.prototype.clear;
      Storage.prototype.clear = function (this: Storage) {
        clear.call(this);
        if (this === localStorage) apply();
      };
      apply();
    }, width);
    await page.route(`${FAKE_API}/analyst/chat/session`, (route) =>
      route.fulfill({
        status: 200,
        headers: CORS,
        json: { enabled: true, token: "chat.1.9999999999.x", expires_at: new Date(Date.now() + 3600_000).toISOString(), chat_url: ANALYST },
      }),
    );
    await page.route(`${FAKE_API}/analyst/chat/threads/*`, (route) => route.fulfill({ status: 404, headers: CORS, json: {} }));
    await page.route(`${ANALYST}/**`, (route) =>
      route.request().method() === "OPTIONS"
        ? route.fulfill({ status: 204, headers: CORS })
        : route.fulfill({ status: 200, headers: { ...CORS, "content-type": "text/event-stream" }, body: 'event: done\ndata: {"cached":false}\n\n' }),
    );
    await duel.startPractice({ seed: 7 });
    test.skip(!(await page.evaluate(() => document.fullscreenEnabled)), "this browser has no Fullscreen API");
    const row = page.locator(".col-actions");
    await expect(row).toBeVisible();
    const buttons = row.locator(":scope > button");
    for (const name of ["Matchup brief", "Full screen", "Match menu"]) await expect(row.getByRole("button", { name, exact: true })).toBeVisible();
    await expect(row.locator(".hud-copilot-btn")).toBeVisible();
    await expect(row.locator(".hud-pass-btn")).toBeVisible();
    const count = await buttons.count();
    expect(count).toBeGreaterThanOrEqual(5);

    // A column can't be dragged under 200px (250px with the Turn panel), so squeeze the row itself to the width under test.
    await row.evaluate((el, w) => {
      el.style.width = `${w}px`;
      el.style.alignSelf = "flex-end";
    }, width);
    const rowBox = (await row.boundingBox())!;
    expect(Math.round(rowBox.width)).toBe(width);
    const col = (await row.locator("xpath=..").boundingBox())!;
    for (let i = 0; i < count; i++) {
      const b = (await buttons.nth(i).boundingBox())!;
      const label = (await buttons.nth(i).getAttribute("aria-label")) ?? `button ${i}`;
      expect(b.width, `${label} is not squeezed to nothing`).toBeGreaterThan(18);
      expect(b.x, `${label} left edge`).toBeGreaterThanOrEqual(rowBox.x - 0.5);
      expect(b.x + b.width, `${label} right edge`).toBeLessThanOrEqual(rowBox.x + rowBox.width + 0.5);
      expect(b.x, `${label} inside the column`).toBeGreaterThanOrEqual(col.x - 0.5);
      expect(b.x + b.width, `${label} inside the column`).toBeLessThanOrEqual(col.x + col.width + 0.5);
    }
    // The hot-seat switch keeps its whole label: the icons give way, not "→ P2".
    expect(await row.locator(".hud-pass-btn").evaluate((el) => el.scrollWidth <= el.clientWidth)).toBe(true);
    // The row keeps its height and nothing inside it overflows.
    expect(rowBox.height).toBeLessThanOrEqual(46);
    expect(await row.evaluate((el) => el.scrollWidth <= el.clientWidth + 1)).toBe(true);

    // The brief opens its Log Pose panel by itself on a computer; close it so it is not over the menu button.
    const lpPanel = page.getByRole("dialog", { name: /Log Pose/ });
    if (await lpPanel.isVisible()) {
      await lpPanel.getByRole("button", { name: /close/i }).click();
      await expect(lpPanel).toBeHidden();
    }
    await row.getByRole("button", { name: "Match menu" }).click();
    const menu = page.getByRole("menu", { name: "Match menu" });
    await expect(menu.getByRole("menuitem", { name: /Gameplay settings/ })).toBeVisible();
    await expect(menu.getByRole("menuitem", { name: /Full screen/ })).toHaveCount(0);
  });
}

test("the Full screen button in the row toggles full screen (#796)", async ({ page }) => {
  await openDemo(page, DESKTOP, { bigBoard: true });
  test.skip(!(await page.evaluate(() => document.fullscreenEnabled)), "this browser has no Fullscreen API");
  const btn = page.locator(".col-actions .hud-fullscreen-btn");
  await btn.click();
  await expect.poll(() => page.evaluate(() => document.fullscreenElement != null)).toBe(true);
  await expect(page.locator(".col-actions").getByRole("button", { name: "Exit full screen" })).toBeVisible();
  await page.locator(".col-actions").getByRole("button", { name: "Exit full screen" }).click();
  await expect.poll(() => page.evaluate(() => document.fullscreenElement != null)).toBe(false);
});

test("a portrait phone keeps Full screen in its match menu (#796)", async ({ page }) => {
  await openDemo(page, { width: 375, height: 812 }, { bigBoard: true });
  test.skip(!(await page.evaluate(() => document.fullscreenEnabled)), "this browser has no Fullscreen API");
  await page.getByRole("button", { name: "Match menu" }).click();
  await expect(page.getByRole("menu", { name: "Match menu" }).getByRole("menuitem", { name: /Full screen/ })).toBeVisible();
});
