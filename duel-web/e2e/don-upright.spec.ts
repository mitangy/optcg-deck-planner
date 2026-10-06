/**
 * "Upright DON!! on rested cards" (#351): DON!! under a rested Leader or
 * Character turns sideways with it by default and stays upright with the
 * Gameplay switch on.
 */
import { test, expect } from "./fixtures";
import type { Page } from "@playwright/test";

async function openDemo(page: Page, settings: Record<string, unknown>) {
  await page.addInitScript((s) => localStorage.setItem("optcg-duel:settings", JSON.stringify(s)), settings);
  await page.goto("/demo?dons&rest=2&restlead");
  await page.locator(".board-root").waitFor();
}

async function layerSize(page: Page, side: "you" | "opp") {
  const layer = page.locator(`.side-${side} .card-tile.rested .don-under-layer`).first();
  await expect(layer).toBeAttached();
  return layer.evaluate((el) => {
    const r = el.getBoundingClientRect();
    return { w: r.width, h: r.height };
  });
}

test("DON!! under a rested card turns sideways with it by default (#351)", async ({ page }) => {
  await openDemo(page, {});
  const { w, h } = await layerSize(page, "you");
  expect(w).toBeGreaterThan(h);
});

test("Upright DON!! on: DON!! under a rested card stays upright (#351)", async ({ page }) => {
  await openDemo(page, { donUpright: true });
  for (const side of ["you", "opp"] as const) {
    const { w, h } = await layerSize(page, side);
    expect(h, `${side} side`).toBeGreaterThan(w);
  }
});
