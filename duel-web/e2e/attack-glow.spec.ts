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

const ringColour = (page: Page, id: string) =>
  page.locator(`.side-you [data-instance-id="${id}"]`).evaluate((el) => getComputedStyle(el).boxShadow.split(")")[0] + ")");

test("attack-ready ring is light on Green cards and green on the rest, with a dark edge (#449)", async ({ page }) => {
  await page.goto("/demo?cantattack&attackready&green");
  await page.locator(".board-root").waitFor();
  for (const id of ["y-leader", "y-c3"]) {
    const card = page.locator(`.side-you [data-instance-id="${id}"]`);
    await expect(card, id).toHaveClass(/attack-ready/);
    expect(await ringColour(page, id), id).toBe("rgb(255, 232, 150)");
    const edge = await card.evaluate((el) => getComputedStyle(el).borderTopColor.match(/\d+/g)!.slice(0, 3).map(Number));
    expect(Math.max(...edge), `${id} edge ${edge}`).toBeLessThan(40);
  }
  await page.goto("/demo?cantattack");
  await page.locator(".board-root").waitFor();
  expect(await ringColour(page, "y-leader")).toBe("rgb(74, 222, 128)");
});
