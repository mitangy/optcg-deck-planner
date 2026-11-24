import { test, expect } from "./fixtures";
import type { Page } from "@playwright/test";

test.use({ legacyLayout: false });

const phoneOnly = () => test.skip(test.info().project.name !== "phone-375", "phone layout");

async function openDemo(page: Page, query: string) {
  await page.goto(`/demo${query}`);
  await page.locator(".board-root").waitFor();
  await page.waitForTimeout(500);
}

const pillCount = async (page: Page) => Number((await page.locator(".defend-tray .defend-hand").innerText()).match(/\d+/)![0]);

test("the portrait counter tray's Hand button shows the real hand in the same box (#1368)", async ({ page }) => {
  phoneOnly();
  await openDemo(page, "?counter");
  const toggle = page.locator(".defend-tray button.defend-hand");
  await expect(toggle).toHaveAttribute("aria-expanded", "false");
  const n = await pillCount(page);
  const trayBefore = (await page.locator(".defend-tray").boundingBox())!;
  const before = (await toggle.boundingBox())!;
  await toggle.click();
  await expect(toggle).toHaveAttribute("aria-expanded", "true");
  const cards = page.locator(".defend-tray .defend-hand-view .card-tile");
  await expect(cards).toHaveCount(n);
  await expect(page.locator(".defend-tray .defend-chips")).toHaveCount(0);
  const trayAfter = (await page.locator(".defend-tray").boundingBox())!;
  expect(trayAfter.height).toBeCloseTo(159, 0);
  expect(trayAfter.y).toBeCloseTo(trayBefore.y, 0);
  const after = (await toggle.boundingBox())!;
  expect(after.x).toBeCloseTo(before.x, 0);
  expect(after.width).toBeCloseTo(before.width, 0);
  const view = (await page.locator(".defend-hand-view").boundingBox())!;
  const first = (await cards.first().boundingBox())!;
  expect(first.y + first.height).toBeLessThanOrEqual(trayAfter.y + trayAfter.height + 0.5);
  expect(first.y).toBeGreaterThanOrEqual(view.y - 0.5);
  await toggle.click();
  await expect(page.locator(".defend-tray .defend-chips .defend-chip").first()).toBeVisible();
});

test("tapping a Counter card in the open hand stages it like its chip (#1368)", async ({ page }) => {
  phoneOnly();
  await openDemo(page, "?counter");
  const toggle = page.locator(".defend-tray button.defend-hand");
  await toggle.click();
  const before = (await toggle.boundingBox())!;
  const counterCards = page.locator(".defend-tray .defend-hand-view .card-tile", { has: page.locator(".counter-badge") });
  await counterCards.first().click();
  await expect(toggle).toHaveText(/^Hand \d+ → \d+$/);
  await expect(page.locator(".defend-hand-view .card-tile.hand-staged")).toHaveCount(1);
  const after = (await toggle.boundingBox())!;
  expect(after.x).toBeCloseTo(before.x, 0);
  expect(after.width).toBeCloseTo(before.width, 0);
  await toggle.click();
  await expect(page.locator(".defend-chips .defend-chip.staged")).toHaveCount(1);
  await toggle.click();
  await page.locator(".defend-hand-view .card-tile.hand-staged").click();
  await expect(toggle).toHaveText(/^Hand \d+$/);
});

test("the landscape block tray's Hand button shows the hand without resizing the column (#1368)", async ({ page }) => {
  phoneOnly();
  await page.setViewportSize({ width: 812, height: 375 });
  await openDemo(page, "?counter=block");
  const toggle = page.locator(".defend-tray button.defend-hand");
  await expect(toggle).toBeVisible();
  const n = await pillCount(page);
  const trayBefore = (await page.locator(".defend-tray").boundingBox())!;
  const before = (await toggle.boundingBox())!;
  await toggle.click();
  const cards = page.locator(".defend-tray .defend-hand-view .card-tile");
  await expect(cards).toHaveCount(n);
  const trayAfter = (await page.locator(".defend-tray").boundingBox())!;
  expect(trayAfter.height).toBeCloseTo(trayBefore.height, 0);
  expect(trayAfter.y).toBeCloseTo(trayBefore.y, 0);
  const after = (await toggle.boundingBox())!;
  expect(after.x).toBeCloseTo(before.x, 0);
  const col = (await page.locator(".arena-rail").boundingBox())!;
  const first = (await cards.first().boundingBox())!;
  expect(first.x).toBeGreaterThanOrEqual(col.x - 0.5);
  expect(first.x + first.width).toBeLessThanOrEqual(col.x + col.width + 0.5);
});

test("the desktop defend rail has no Hand toggle (#1368)", async ({ page }) => {
  test.skip(test.info().project.name !== "desktop-1280", "desktop layout");
  await openDemo(page, "?counter");
  await expect(page.locator(".defend-tray")).toBeVisible();
  await expect(page.locator(".defend-tray button.defend-hand")).toHaveCount(0);
});
