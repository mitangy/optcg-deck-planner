/**
 * Attack-ready glow (#412): your Leader and Characters that can attack right
 * now glow green by default; the Gameplay switch turns it off. `?cantattack`
 * is a main phase where only the Leader has a declare_attack intent, while
 * the Characters are summoning sick, rested or otherwise unable to attack.
 */
import { test, expect } from "./fixtures";
import type { Page } from "@playwright/test";

async function openDemo(page: Page, settings: Record<string, unknown>) {
  await page.addInitScript((s) => localStorage.setItem("optcg-duel:settings", JSON.stringify(s)), settings);
  await page.goto("/demo?cantattack");
  await page.locator(".board-root").waitFor();
}

test("attack-ready cards glow green by default (#412)", async ({ page }) => {
  await openDemo(page, {});
  await expect(page.locator('.side-you [data-instance-id="y-leader"]')).toHaveClass(/attack-ready/);
  // Summoning sick, rested, and a healthy Character with no attack intent.
  for (const id of ["y-c1", "y-c2", "y-c3"]) {
    await expect(page.locator(`.side-you [data-instance-id="${id}"]`), id).not.toHaveClass(/attack-ready/);
  }
  await expect(page.locator(".side-opp .attack-ready")).toHaveCount(0);
  await expect(page.locator(".attack-ready")).toHaveCount(1);
});

test("Attack-ready glow off: no card glows (#412)", async ({ page }) => {
  await openDemo(page, { attackGlow: false });
  await expect(page.locator('.side-you [data-instance-id="y-leader"]')).toBeAttached();
  await expect(page.locator(".attack-ready")).toHaveCount(0);
});
