import { test, expect } from "./fixtures";
import type { Page } from "@playwright/test";

async function openDemo(page: Page, settings: Record<string, unknown>) {
  await page.addInitScript((s) => localStorage.setItem("optcg-duel:settings", JSON.stringify(s)), settings);
  await page.goto("/demo?turn0&pickedby=coin");
  await page.locator(".board-root").waitFor();
}

test("Opening hand tips are hidden by default (#599)", async ({ page }) => {
  await openDemo(page, {});
  await expect(page.getByRole("button", { name: /^Keep/ }).first()).toBeVisible();
  await expect(page.getByRole("button", { name: /^Mulligan/ }).first()).toBeVisible();
  await expect(page.locator(".mulligan-hand-hint")).toHaveCount(0);
  await expect(page.getByText(/Keep these cards/)).toHaveCount(0);
});

test("Opening hand tips on: the explainer shows (#599)", async ({ page }) => {
  await openDemo(page, { gameHints: true });
  await expect(page.getByText(/Keep these cards/).first()).toBeVisible();
  await expect(page.locator(".mulligan-hand-hint")).toBeAttached();
});
