/** Choosing the DON!! card art (#440): Settings picker, and each side's DON!! on the board. */
import { test, expect } from "./fixtures";
import type { Page } from "@playwright/test";

const CHOSEN = 710860;
const CHOSEN_URL = `https://tcgplayer-cdn.tcgplayer.com/product/${CHOSEN}_400w.jpg`;

async function withSettings(page: Page, settings: Record<string, unknown>) {
  await page.addInitScript((s) => {
    if (!sessionStorage.getItem("seeded")) {
      localStorage.setItem("optcg-duel:settings", JSON.stringify(s));
      sessionStorage.setItem("seeded", "1");
    }
  }, settings);
}

test("your DON!! shows the chosen art and the opponent's the default (#440)", async ({ page }) => {
  await withSettings(page, { donArt: CHOSEN });
  await page.goto("/demo?dons&rest=2&restlead");
  await page.locator(".board-root").waitFor();

  const mine = page.locator(".side-you .zone-cost img");
  await expect(mine.first()).toBeAttached();
  const mineSrc = await mine.evaluateAll((els) => els.map((e) => (e as HTMLImageElement).getAttribute("src")));
  expect(mineSrc.length).toBeGreaterThan(0);
  for (const src of mineSrc) expect(src).toBe(CHOSEN_URL);

  const theirs = page.locator(".side-opp .zone-cost img");
  const theirSrc = await theirs.evaluateAll((els) => els.map((e) => (e as HTMLImageElement).getAttribute("src")));
  for (const src of theirSrc) expect(src).toBe("/cards/DON.jpg");

  const under = (side: string) =>
    page.locator(`.side-${side} .don-under-layer`).first().evaluate((el) => getComputedStyle(el).backgroundImage);
  expect(await under("you")).toContain(String(CHOSEN));
  expect(await under("opp")).not.toContain(String(CHOSEN));
});

test("Settings: search, pick, persist and reset the DON!! card (#440)", async ({ page }) => {
  await withSettings(page, {});
  await page.goto("/settings");
  const panel = page.locator("#don-card");
  await panel.scrollIntoViewIfNeeded();
  const preview = panel.locator(".don-art-preview");
  await expect(preview).toHaveAttribute("src", "/cards/DON.jpg");

  await panel.getByLabel("Find DON!! art").fill("Luffy and Loki");
  const tile = panel.locator(".don-art-tile", { hasText: "Luffy and Loki" }).first();
  await tile.scrollIntoViewIfNeeded();
  await tile.click();
  await expect(tile).toHaveAttribute("aria-pressed", "true");
  await expect(preview).toHaveAttribute("src", /tcgplayer-cdn\.tcgplayer\.com\/product\/\d+_400w\.jpg$/);
  const chosen = await preview.getAttribute("src");

  await page.reload();
  await expect(page.locator("#don-card .don-art-preview")).toHaveAttribute("src", chosen!);

  await page.locator("#don-card").getByRole("button", { name: "Use default" }).click();
  await expect(page.locator("#don-card .don-art-preview")).toHaveAttribute("src", "/cards/DON.jpg");
});
