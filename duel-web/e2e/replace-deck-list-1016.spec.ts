/**
 * Duel deck editor (#1016): the folded panel is labelled "Replace with deck list" and overwrites the open deck's
 * leader and cards; the deck keeps its name and Save keeps the change. Set SHOTS_DIR to save screenshots.
 */
import type { Page } from "@playwright/test";
import { test, expect, RED_VANILLA } from "./fixtures";

const DECK_ID = "e2e-replace-1016";

const shot = async (page: Page, name: string) => {
  if (process.env.SHOTS_DIR) await page.screenshot({ path: `${process.env.SHOTS_DIR}/${name}.png` });
};

test("Replace with deck list overwrites the open deck and keeps its name (#1016)", async ({ page }, info) => {
  await page.addInitScript(
    ([id, deck]) => {
      if (sessionStorage.getItem("e2e-seeded")) return;
      sessionStorage.setItem("e2e-seeded", "1");
      localStorage.clear();
      localStorage.setItem("optcg.duel.savedDecks.v1", JSON.stringify([{ id, name: "Red Vanilla", ...deck, updatedAt: 1 }]));
    },
    [DECK_ID, RED_VANILLA] as const,
  );
  await page.goto(`/decks/${DECK_ID}/configure`);
  const stack = (id: string) => page.locator("article.deck-stack", { hasText: id });
  await expect(stack("ST01-006")).not.toHaveCount(0);

  await page.locator("summary", { hasText: "Replace with deck list" }).click();
  await page.locator("#deck-import-text").fill("1xST01-001\n4xST01-003\n4xST01-008");
  await shot(page, `duel-${info.project.name}-1-pasted`);
  await page.getByRole("button", { name: "Replace deck", exact: true }).click();

  await expect(page.getByText("Imported (8 main), not saved yet")).toBeVisible();
  await expect(stack("ST01-006")).toHaveCount(0);
  await expect(stack("ST01-008").getByLabel("4 copies")).toBeVisible();
  await expect(page.getByRole("textbox", { name: "Deck name" })).toHaveValue("Red Vanilla");
  await expect(page.getByRole("button", { name: "Save", exact: true })).toBeEnabled();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await shot(page, `duel-${info.project.name}-2-replaced`);
  if (info.project.name === "phone-375") {
    await page.setViewportSize({ width: 812, height: 375 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    await shot(page, "duel-phone-812x375-2-replaced");
  }
});
