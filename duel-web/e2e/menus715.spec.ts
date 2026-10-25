/**
 * The match menu, the Undo menu and the site menu drawer on the shared Headless UI Menu / Dialog (#715):
 * they open fully on screen under their button at every phone and desktop size without moving it,
 * keys work inside them, the board's own keys stay quiet while one is open, and the drawer traps Tab.
 * The viewports are set here, so the board specs run once (in the desktop project).
 */
import { test, expect, FAKE_API } from "./fixtures";
import type { Locator, Page } from "@playwright/test";

const SIZES = [
  { name: "phone portrait", width: 375, height: 812, settings: {} },
  { name: "phone landscape", width: 812, height: 375, settings: {} },
  { name: "desktop with the top bar", width: 1280, height: 720, settings: {} },
  { name: "desktop with Bigger playing area", width: 1280, height: 720, settings: { bigBoard: true } },
];

async function openDemo(page: Page, size: (typeof SIZES)[number], query = "") {
  await page.setViewportSize({ width: size.width, height: size.height });
  await page.addInitScript((s) => localStorage.setItem("optcg-duel:settings", JSON.stringify(s)), size.settings);
  await page.goto(`/demo${query}`);
  await page.locator(".board-root").waitFor();
  // The board lays out in a frame or two after the media queries settle.
  await page.waitForTimeout(400);
}

const matchButton = (page: Page) => page.getByRole("button", { name: "Match menu" }).first();
const sent = (page: Page) => page.evaluate(() => (window as { __demoIntents?: unknown[] }).__demoIntents ?? []);

function expectOnScreen(box: { x: number; y: number; width: number; height: number }, vp: { width: number; height: number }, what: string) {
  expect(box.x, `${what} left`).toBeGreaterThanOrEqual(0);
  expect(box.y, `${what} top`).toBeGreaterThanOrEqual(0);
  expect(box.x + box.width, `${what} right`).toBeLessThanOrEqual(vp.width + 0.5);
  expect(box.y + box.height, `${what} bottom`).toBeLessThanOrEqual(vp.height + 0.5);
}

/** Arrow down the open menu until the active row's text starts with `text`. */
async function walkTo(page: Page, menu: Locator, text: string) {
  const active = () => menu.evaluate((el) => document.getElementById(el.getAttribute("aria-activedescendant") ?? "")?.textContent ?? "");
  for (let i = 0; i < 12 && !(await active()).startsWith(text); i += 1) await page.keyboard.press("ArrowDown");
  expect(await active()).toMatch(new RegExp(`^${text}`));
}

test.beforeEach(({}, info) => {
  test.skip(info.project.name !== "desktop-1280", "sets its own viewports");
});

for (const size of SIZES) {
  test(`the match menu opens on screen beside its button and moves nothing, ${size.name} (#715)`, async ({ page }) => {
    await openDemo(page, size);
    const trigger = matchButton(page);
    test.skip((await trigger.count()) === 0 || !(await trigger.isVisible()), "no match menu button at this size without Bigger playing area");
    const before = (await trigger.boundingBox())!;
    await trigger.click();
    const menu = page.getByRole("menu", { name: "Match menu" });
    await expect(menu).toBeVisible();
    expectOnScreen((await menu.boundingBox())!, size, "menu");
    // Opening it moves nothing, and the list does not cover its own button.
    expect(await trigger.boundingBox()).toEqual(before);
    const m = (await menu.boundingBox())!;
    const overlaps = m.x < before.x + before.width && m.x + m.width > before.x && m.y < before.y + before.height && m.y + m.height > before.y;
    expect(overlaps, "the menu covers its button").toBe(false);
    // The last row is reachable: the list scrolls when the window is short.
    await menu.getByRole("menuitem").last().scrollIntoViewIfNeeded();
    expectOnScreen((await menu.getByRole("menuitem").last().boundingBox())!, size, "last row");
    await page.keyboard.press("Escape");
    await expect(menu).toHaveCount(0);
    await expect(trigger).toBeFocused();
  });

  test(`the Undo menu opens on screen beside its button and moves nothing, ${size.name} (#715)`, async ({ page }) => {
    await openDemo(page, size, "?undo=menu");
    const menu = page.getByRole("menu");
    await expect(menu).toBeVisible();
    expectOnScreen((await menu.boundingBox())!, size, "menu");
    const name = await menu.getAttribute("aria-labelledby");
    const trigger = page.locator(`[id="${name}"]`);
    const open = (await trigger.boundingBox())!;
    await page.keyboard.press("Escape");
    await expect(menu).toHaveCount(0);
    await expect(trigger).toBeFocused();
    expect(await trigger.boundingBox(), "closing it moves nothing").toEqual(open);
    await trigger.click();
    await expect(menu).toBeVisible();
    expect(await trigger.boundingBox(), "opening it moves nothing").toEqual(open);
  });
}

test("arrow keys walk the match menu, Enter runs a row and Escape returns focus to the button (#715)", async ({ page }) => {
  await openDemo(page, SIZES[3]!);
  const trigger = matchButton(page);
  await trigger.focus();
  await page.keyboard.press("Enter");
  const menu = page.getByRole("menu", { name: "Match menu" });
  await expect(menu).toBeVisible();
  const rows = menu.getByRole("menuitem");
  const active = () => menu.evaluate((el) => document.getElementById(el.getAttribute("aria-activedescendant") ?? "")?.textContent ?? "");
  await page.keyboard.press("ArrowDown");
  const first = await active();
  await page.keyboard.press("ArrowDown");
  expect(await active()).not.toBe(first);
  await page.keyboard.press("Home");
  expect(await active()).toBe(await rows.first().innerText());
  await page.keyboard.press("End");
  expect(await active()).toBe(await rows.last().innerText());
  await page.keyboard.press("Escape");
  await expect(menu).toHaveCount(0);
  await expect(trigger).toBeFocused();

  // Enter on Gameplay settings opens it.
  await page.keyboard.press("Enter");
  await expect(menu).toBeVisible();
  await walkTo(page, menu, "Gameplay settings");
  await page.keyboard.press("Enter");
  await expect(page.getByRole("dialog", { name: "Gameplay settings" })).toBeVisible();
  await expect(menu).toHaveCount(0);
});

test("Concede in the match menu needs two presses, by keyboard too (#715)", async ({ page }) => {
  await openDemo(page, SIZES[3]!);
  await matchButton(page).focus();
  await page.keyboard.press("Enter");
  const menu = page.getByRole("menu", { name: "Match menu" });
  // Armed, its name is "Click again to concede": find it by its danger class.
  const concede = menu.locator(".match-menu-danger");
  await walkTo(page, menu, "Concede");
  await page.keyboard.press("Enter");
  await expect(menu).toBeVisible();
  await expect(concede).toHaveClass(/armed/);
  expect(await sent(page)).toEqual([]);
});

test("board keys do nothing while the Undo menu is open, and work again after it closes (#715)", async ({ page }) => {
  await openDemo(page, SIZES[2]!, "?prompt=confirm&undo=menu");
  await expect(page.getByRole("menu")).toBeVisible();
  await page.keyboard.press("y");
  await page.waitForTimeout(150);
  expect(await sent(page)).toEqual([]);
  await page.keyboard.press("Escape");
  await expect(page.getByRole("menu")).toHaveCount(0);
  await page.keyboard.press("y");
  await expect.poll(() => sent(page)).toEqual([{ type: "resolve_pending_choice", accept: true }]);
});

test("board keys do nothing while the match menu is open (#715)", async ({ page }) => {
  await openDemo(page, SIZES[3]!, "?prompt=confirm");
  await matchButton(page).click();
  await expect(page.getByRole("menu", { name: "Match menu" })).toBeVisible();
  await page.keyboard.press("y");
  await page.waitForTimeout(150);
  expect(await sent(page)).toEqual([]);
});

async function fakeApi(page: Page) {
  await page.route(`${FAKE_API}/**`, (route) => {
    const path = new URL(route.request().url()).pathname;
    if (path === "/health") return route.fulfill({ json: { ok: true } });
    if (path === "/auth/me") return route.fulfill({ status: 401, json: { detail: "not signed in" } });
    return route.fulfill({ status: 404, json: { detail: "not in e2e fake API" } });
  });
}

test("Tab and Shift+Tab stay inside the open site menu drawer (#715)", async ({ page }) => {
  await fakeApi(page);
  await page.goto("/settings");
  const hamburger = page.getByRole("button", { name: "Menu" });
  await hamburger.click();
  const drawer = page.getByRole("dialog", { name: "Site menu" });
  await expect(drawer).toBeVisible();
  const inside = () => drawer.evaluate((el) => el.contains(document.activeElement));
  const links = await drawer.getByRole("link").count();
  for (let i = 0; i < links + 3; i += 1) {
    await page.keyboard.press("Tab");
    expect(await inside(), `Tab ${i + 1}`).toBe(true);
  }
  for (let i = 0; i < links + 3; i += 1) {
    await page.keyboard.press("Shift+Tab");
    expect(await inside(), `Shift+Tab ${i + 1}`).toBe(true);
  }
  await page.keyboard.press("Escape");
  await expect(drawer).toHaveCount(0);
  await expect(hamburger).toBeFocused();
});

test("the site menu drawer slides out when closed instead of vanishing (#722)", async ({ page }) => {
  await fakeApi(page);
  await page.goto("/settings");
  // Stretch the slide so the test can look at the middle of it.
  await page.addStyleTag({ content: ".nav-drawer, .nav-drawer-root { transition-duration: 2s !important; }" });
  const hamburger = page.getByRole("button", { name: "Menu" });
  await hamburger.click();
  const drawer = page.getByRole("dialog", { name: "Site menu" });
  const panel = drawer.locator(".nav-drawer");
  await expect(panel).not.toHaveAttribute("data-closed", /.*/);
  await expect.poll(async () => (await panel.boundingBox())?.x, { message: "slid fully in" }).toBe(0);

  await page.keyboard.press("Escape");
  // Mid-close: still in the page, marked closed, and partway off the left edge.
  await expect(drawer).toHaveCount(1);
  await expect(panel).toHaveAttribute("data-closed", "");
  await expect.poll(async () => (await panel.boundingBox())!.x).toBeLessThan(0);
  const box = (await panel.boundingBox())!;
  expect(box.x + box.width).toBeGreaterThan(0);
  await expect(drawer).toHaveCount(0, { timeout: 8000 });
  await expect(hamburger).toBeFocused();
});

test("the site menu drawer closes at once with reduced motion (#722)", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await fakeApi(page);
  await page.goto("/settings");
  // Only the duration (not the property): were the drawer still allowed to transition, it would take 2s.
  await page.addStyleTag({ content: ".nav-drawer, .nav-drawer-root { transition-duration: 2s; }" });
  await page.getByRole("button", { name: "Menu" }).click();
  const drawer = page.getByRole("dialog", { name: "Site menu" });
  await expect(drawer).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(drawer).toHaveCount(0, { timeout: 500 });
});
