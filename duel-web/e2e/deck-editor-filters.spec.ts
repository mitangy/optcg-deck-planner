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

test("the deck editor's Add cards filters stay small checkboxes that toggle behind More filters (#755, #1343)", async ({ page }, info) => {
  await seed(page);
  await page.goto(`/decks/${DECK_ID}/configure`);
  if (info.project.name === "phone-375") await page.getByRole("button", { name: "Add cards", exact: true }).first().click();
  const section = page.locator("details.deck-add-cards, .deck-add-sheet");

  // Colours are always visible chips; the rest hides until More filters opens.
  await expect(section.locator("label.deck-color-chip")).toHaveCount(6);
  await expect(section.locator("fieldset")).toHaveCount(0);
  const red = section.locator("label.deck-color-chip", { hasText: "Red" });
  // A red Leader starts with Red ticked (#1386); the chip still toggles off and on.
  await expect(red.locator("input")).toBeChecked();
  await red.click();
  await expect(red.locator("input")).not.toBeChecked();
  await red.click();
  await expect(red.locator("input")).toBeChecked();

  await section.getByRole("button", { name: "More filters" }).click();
  for (const [fieldset, name] of [["Type", "Character"], ["Attribute", "Strike"]] as const) {
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

  const pad = await section.locator(".deck-search-query input").evaluate((el) => parseFloat(getComputedStyle(el).paddingLeft));
  expect(pad).toBeLessThan(30);
});

test("More filters shows how many hidden filters are set, narrows results and remembers open or closed (#1343)", async ({ page }, info) => {
  await seed(page);
  await page.goto(`/decks/${DECK_ID}/configure`);
  if (info.project.name === "phone-375") await page.getByRole("button", { name: "Add cards", exact: true }).first().click();
  const section = page.locator("details.deck-add-cards, .deck-add-sheet");
  const more = section.getByRole("button", { name: /^More filters/ });
  await expect(more).toHaveAttribute("aria-expanded", "false");

  await section.getByRole("searchbox").fill("luffy");
  const all = section.locator(".deck-search-row");
  await expect(all.first()).toBeVisible();
  const before = await all.count();

  await more.click();
  await expect(more).toHaveAttribute("aria-expanded", "true");
  await section.locator("label.deck-filter-chip", { hasText: "Event" }).click();
  await section.locator("label.deck-search-field", { hasText: "Cost max" }).locator("input").fill("1");
  await more.click();
  await expect(more).toHaveAttribute("aria-expanded", "false");
  await expect(more.getByLabel("2 active")).toBeVisible();
  await expect(section.locator(".deck-search-row")).not.toHaveCount(before);
  for (const row of await section.locator(".deck-search-row .deck-stack-id").allTextContents()) {
    expect(row).toMatch(/\bevent\b/i);
    expect(row).toMatch(/\bcost [01]\b/i);
  }

  await more.click();
  await page.reload();
  if (info.project.name === "phone-375") await page.getByRole("button", { name: "Add cards", exact: true }).first().click();
  await expect(section.getByRole("button", { name: /^More filters/ })).toHaveAttribute("aria-expanded", "true");
});

test("the Decks page search box keeps room for its icon (#755)", async ({ page }) => {
  await seed(page);
  await page.goto("/decks");
  const input = page.getByRole("searchbox", { name: "Search decks or leaders" });
  await expect(input).toBeVisible();
  const pad = await input.evaluate((el) => parseFloat(getComputedStyle(el).paddingLeft));
  expect(pad).toBeGreaterThanOrEqual(30);
});
