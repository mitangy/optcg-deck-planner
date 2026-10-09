/**
 * "Show on screen" switches (#449): Card preview, Recent plays and Chat can be
 * hidden; the Battle log always stays and has no switch. Everything is shown
 * by default. Hidden desktop panels keep their place in the saved layout, the
 * rest of the column takes the room, and a column with nothing left collapses.
 */
import { test, expect } from "./fixtures";
import type { Page } from "@playwright/test";

async function openDemo(page: Page, settings: Record<string, unknown>, size?: { width: number; height: number }) {
  if (size) await page.setViewportSize(size);
  await page.addInitScript((s) => localStorage.setItem("optcg-duel:settings", JSON.stringify(s)), settings);
  await page.goto("/demo?chat");
  await page.locator(".board-root").waitFor();
  await page.waitForTimeout(300);
}

const panel = (page: Page, id: string) => page.locator(`[data-panel="${id}"]`);
const onDesktop = () => test.info().project.name === "desktop-1280";

test.describe("desktop panels", () => {
  test.beforeEach(() => {
    test.skip(!onDesktop(), "side panels are the desktop board");
  });

  test("every panel is shown by default (#449)", async ({ page }) => {
    await openDemo(page, {});
    for (const id of ["preview", "recent", "log", "chat"]) await expect(panel(page, id), id).toBeVisible();
  });

  for (const [key, id] of [
    ["showCardPreview", "preview"],
    ["showRecentPlays", "recent"],
    ["showChat", "chat"],
  ] as const) {
    test(`${key} off removes only the ${id} panel and the Battle log stays (#449)`, async ({ page }) => {
      await openDemo(page, { [key]: false });
      await expect(panel(page, id)).toHaveCount(0);
      for (const other of ["preview", "recent", "chat"].filter((p) => p !== id)) {
        await expect(panel(page, other), other).toBeVisible();
      }
      await expect(panel(page, "log")).toBeVisible();
    });
  }

  test("the Battle log stays with everything hidden, and takes the freed height (#449)", async ({ page }) => {
    await openDemo(page, {});
    const before = (await panel(page, "log").boundingBox())!;
    await openDemo(page, { showCardPreview: false, showRecentPlays: false, showChat: false });
    const log = panel(page, "log");
    await expect(log).toBeVisible();
    expect((await log.boundingBox())!.height).toBeGreaterThan(before.height * 1.5);
  });

  test("the Settings switches hide and show the panels live, with none for the Battle log (#449)", async ({ page }) => {
    await openDemo(page, {});
    await page.getByRole("button", { name: "Gameplay settings" }).click();
    const sheet = page.getByRole("dialog", { name: "Gameplay settings" });
    await expect(sheet.getByText("Show on screen")).toBeVisible();
    await expect(sheet.getByRole("checkbox", { name: /battle log/i })).toHaveCount(0);
    await expect(sheet.getByRole("checkbox", { name: "Bigger playing area" })).not.toBeChecked();

    for (const [name, id] of [
      ["Card preview", "preview"],
      ["Recent plays", "recent"],
      ["Chat", "chat"],
    ] as const) {
      const box = sheet.getByRole("checkbox", { name, exact: true });
      await expect(box).toBeChecked();
      await box.uncheck();
      await expect(panel(page, id), `${name} off`).toHaveCount(0);
      await box.check();
      await expect(panel(page, id), `${name} back on`).toBeVisible();
    }
    await expect(panel(page, "log")).toBeVisible();
  });

  test("a hidden panel keeps its place in the saved layout and returns to it (#449)", async ({ page }) => {
    const layout = "preview,recent,log,chat|oppHand,turn,hand";
    await openDemo(page, { panelLayout: layout, showChat: false });
    await expect(panel(page, "chat")).toHaveCount(0);
    expect(await page.evaluate(() => JSON.parse(localStorage.getItem("optcg-duel:settings")!).panelLayout)).toBe(layout);

    await page.getByRole("button", { name: "Gameplay settings" }).click();
    await page.getByRole("dialog", { name: "Gameplay settings" }).getByRole("checkbox", { name: "Chat", exact: true }).check();
    // Back at the end of the left column, not the right one it started in.
    await expect(page.locator('[data-panel-col="left"] [data-panel="chat"]')).toBeVisible();
    expect(await page.evaluate(() => JSON.parse(localStorage.getItem("optcg-duel:settings")!).panelLayout)).toBe(layout);
  });

  test("a column with nothing left to show collapses and the playmat area gets its width (#449)", async ({ page }) => {
    const layout = "preview,recent|log,oppHand,turn,hand,chat";
    const matWidth = () => page.locator(".playmat").evaluate((el) => el.getBoundingClientRect().width);
    const leftWidth = () => page.locator(".arena-left").evaluate((el) => el.getBoundingClientRect().width);
    await openDemo(page, { panelLayout: layout });
    const shown = { mat: await matWidth(), left: await leftWidth() };
    expect(shown.left).toBeGreaterThan(150);

    await openDemo(page, { panelLayout: layout, showCardPreview: false, showRecentPlays: false });
    expect(await leftWidth()).toBeLessThan(2);
    expect(await matWidth()).toBeGreaterThan(shown.mat);
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(1280);
  });
});

test.describe("phones", () => {
  test("the Chat pill is shown by default and gone with Chat off, the Battle log stays (#449)", async ({ page }) => {
    test.skip(onDesktop(), "portrait phone");
    await openDemo(page, {});
    await expect(page.locator(".chat-panel")).toBeVisible();
    await openDemo(page, { showChat: false });
    await expect(page.locator(".chat-panel")).toHaveCount(0);
    await expect(page.locator(".battle-log")).toBeVisible();
  });

  test("the Chat switch is in the phone Settings sheet, with none for the desktop-only panels or the log (#449)", async ({ page }) => {
    test.skip(onDesktop(), "portrait phone");
    await openDemo(page, {});
    await page.getByRole("button", { name: "Match menu" }).click();
    await page.getByRole("menuitem", { name: /Gameplay settings/ }).click();
    const sheet = page.getByRole("dialog", { name: "Gameplay settings" });
    await expect(sheet.getByRole("checkbox", { name: "Chat", exact: true })).toBeChecked();
    await expect(sheet.getByRole("checkbox", { name: "Card preview", exact: true })).toHaveCount(0);
    await expect(sheet.getByRole("checkbox", { name: "Recent plays", exact: true })).toHaveCount(0);
    await expect(sheet.getByRole("checkbox", { name: /battle log/i })).toHaveCount(0);
    await sheet.getByRole("checkbox", { name: "Chat", exact: true }).uncheck();
    await expect(page.locator(".chat-panel")).toHaveCount(0);
  });

  test("a landscape phone's rail loses the Chat button with Chat off but keeps the Battle log (#449)", async ({ page }) => {
    test.skip(!onDesktop(), "sets its own landscape viewport");
    const size = { width: 812, height: 375 };
    await openDemo(page, {}, size);
    const rail = page.getByRole("navigation", { name: "Board panels" });
    await expect(rail.getByRole("button", { name: "Chat" })).toBeVisible();
    await openDemo(page, { showChat: false }, size);
    await expect(rail.getByRole("button", { name: "Chat" })).toHaveCount(0);
    await expect(rail.getByRole("button", { name: "Battle log" })).toBeVisible();
  });
});
