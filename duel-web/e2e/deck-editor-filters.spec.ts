/**
 * The deck editor's Add cards filters (#755): the Decks page search box styles (`.deck-search input`) once leaked
 * into every input in the editor, turning the Color / Type / Attribute checkboxes into big empty boxes.
 * CSS does not load in vitest, so this is checked in a real browser. The API is not needed (it 404s to signed-out).
 */
import type { Page } from "@playwright/test";
import { test, expect, FAKE_API, RED_VANILLA } from "./fixtures";

const DECK_ID = "e2e-filters";
const KEY = "optcg.duel.savedDecks.v1";

async function seed(page: Page) {
  await page.route(`${FAKE_API}/**`, (route) => route.fulfill({ status: 404, json: { detail: "not in e2e fake API" } }));
  await page.addInitScript(
    ([id, deck, key]) => {
      if (sessionStorage.getItem("e2e-seeded")) return;
      sessionStorage.setItem("e2e-seeded", "1");
      localStorage.clear();
      localStorage.setItem(key, JSON.stringify([{ id, name: "Red Vanilla", ...deck, updatedAt: 1 }]));
    },
    [DECK_ID, RED_VANILLA, KEY] as const,
  );
}

test("the deck editor's Add cards filter checkboxes stay small checkboxes that toggle (#755)", async ({ page }) => {
  await seed(page);
  await page.goto(`/decks/${DECK_ID}/configure`);
  const section = page.locator("details.deck-add-cards");
  if (!(await section.evaluate((d: HTMLDetailsElement) => d.open))) await section.locator("summary").click();

  for (const [fieldset, name] of [["Color", "Red"], ["Type", "Character"], ["Attribute", "Strike"]] as const) {
    const label = section.locator("fieldset", { has: page.getByText(fieldset, { exact: true }) }).locator("label.deck-filter-chip", { hasText: name });
    const box = label.locator('input[type="checkbox"]');
    await expect(box).toBeVisible();
    const size = await box.boundingBox();
    expect(size!.width, `${name} checkbox width`).toBeLessThanOrEqual(24);
    expect(size!.height, `${name} checkbox height`).toBeLessThanOrEqual(24);
    await expect(box).not.toBeChecked();
    await label.click();
    await expect(box).toBeChecked();
    await label.click();
    await expect(box).not.toBeChecked();
  }

  // The Search box keeps its normal padding, not the Decks page's icon gutter.
  const pad = await section.locator(".deck-search-query input").evaluate((el) => parseFloat(getComputedStyle(el).paddingLeft));
  expect(pad).toBeLessThan(30);
});

test("the Decks page search box keeps room for its icon (#755)", async ({ page }) => {
  await seed(page);
  await page.goto("/decks");
  const input = page.getByRole("searchbox", { name: "Search decks or leaders" });
  await expect(input).toBeVisible();
  const pad = await input.evaluate((el) => parseFloat(getComputedStyle(el).paddingLeft));
  expect(pad).toBeGreaterThanOrEqual(30);
});
