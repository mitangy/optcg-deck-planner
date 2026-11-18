import { test, expect } from "./fixtures";
import type { Page } from "@playwright/test";

async function openDemo(page: Page, settings: Record<string, unknown>) {
  if (test.info().project.name === "desktop-1280") await page.setViewportSize({ width: 1920, height: 1200 });
  await page.addInitScript((s) => localStorage.setItem("optcg-duel:settings", JSON.stringify(s)), settings);
  await page.goto("/demo?dons");
  await page.locator(".board-root").waitFor();
}

function buffedBadge(page: Page) {
  return page.locator(".side-you .power-badge-buffed").first();
}

test("Power shows base and bonus by default (#534)", async ({ page }, info) => {
  test.skip(info.project.name !== "desktop-1280", "desktop tiles show the breakdown");
  await openDemo(page, {});
  const badge = buffedBadge(page);
  await expect(badge).toBeVisible();
  await expect(badge.locator(".power-base")).toBeVisible();
  await expect(badge.locator(".power-mod")).toBeVisible();
  await expect(badge.locator(".power-now")).toBeHidden();
});

test("Show total power on: board shows only the total (#534)", async ({ page }) => {
  await openDemo(page, { totalPower: true });
  const badge = buffedBadge(page);
  await expect(badge).toBeVisible();
  const current = (await badge.getAttribute("title"))!.match(/^Power (\d+)/)![1];
  await expect(badge.locator(".power-now")).toBeVisible();
  await expect(badge.locator(".power-now")).toHaveText(current);
  await expect(badge.locator(".power-base")).toBeHidden();
  await expect(badge.locator(".power-mod")).toBeHidden();
});
