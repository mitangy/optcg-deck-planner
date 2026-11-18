import type { Page } from "@playwright/test";
import type { DeckSummary } from "../src/api";
import { expect, test, DECK_ID } from "./fixtures";

test.afterEach(({ planner }) => {
  expect(planner.errors).toEqual([]);
});

const deck = (id: number, name: string, leader: string, isMain: boolean, cost: number | null): DeckSummary => ({
  id,
  name,
  leader_card_id: leader,
  leader_name: leader === "OP13-001" ? "Monkey D. Luffy" : "Nami",
  card_count: 20,
  total_cards: 51,
  main_cards: 51,
  don_cards: 0,
  owned_copies: 33,
  remaining_cost: cost,
  sort_order: id,
  is_main: isMain,
});

async function openDecks(page: Page, planner: { open(p: string): Promise<void> }, decks: DeckSummary[]) {
  const live = [...decks];
  await page.route("**/api/decks", (route) => (route.request().method() === "GET" ? route.fulfill({ json: live }) : route.fallback()));
  await page.route(/\/api\/decks\/\d+$/, (route) => {
    if (route.request().method() !== "DELETE") return route.fallback();
    const id = Number(route.request().url().split("/").pop());
    live.splice(
      live.findIndex((d) => d.id === id),
      1,
    );
    return route.fulfill({ json: { ok: true } });
  });
  await planner.open("/decks");
  await expect(page.locator(".deck-card")).toHaveCount(decks.length);
}

const SOLO_AND_PAIR = [
  deck(11, "Nami solo", "OP11-041", true, 10.04),
  deck(12, "Elbuffy", "OP13-001", true, 4),
  deck(13, "Elbuffy B", "OP13-001", false, 0),
];

test("Main badge, the Main caption and Set as Main only show for a Leader with two or more decks (#1342)", async ({ page, planner }) => {
  await openDecks(page, planner, SOLO_AND_PAIR);
  const solo = page.locator(".deck-leader-group", { hasText: "OP11-041" });
  const pair = page.locator(".deck-leader-group", { hasText: "OP13-001" });
  await expect(solo.locator(".deck-main-badge")).toHaveCount(0);
  await expect(solo).not.toContainText("Main listed first");
  await solo.getByRole("button", { name: "More for Nami solo" }).click();
  await expect(page.getByRole("menuitem", { name: "Delete deck" })).toBeVisible();
  await expect(page.getByRole("menuitem", { name: /Set as Main/ })).toHaveCount(0);
  await page.keyboard.press("Escape");

  await expect(pair.locator(".deck-main-badge")).toHaveCount(1);
  await expect(pair).toContainText("Main listed first");
  await pair.getByRole("button", { name: "More for Elbuffy B" }).click();
  await expect(page.getByRole("menuitem", { name: /Set as Main/ })).toBeVisible();
});

test("A deck card says what is left to finish in dollars beside the copies to go (#1342)", async ({ page, planner }) => {
  await openDecks(page, planner, SOLO_AND_PAIR);
  const card = page.locator(".deck-card", { hasText: "Nami solo" });
  await expect(card).toContainText("18 to go · $10.04 to finish");
});

test("Delete lives in the card menu, cancelling keeps the deck and confirming removes it (#1342)", async ({ page, planner }) => {
  await openDecks(page, planner, SOLO_AND_PAIR);
  const more = page.getByRole("button", { name: "More for Nami solo" });
  await expect(page.getByRole("button", { name: "Delete", exact: true })).toHaveCount(0);

  await more.click();
  await page.getByRole("menuitem", { name: "Delete deck" }).click();
  const confirm = page.getByRole("alertdialog", { name: /Delete “Nami solo”/ });
  await expect(confirm.getByRole("button", { name: "Cancel" })).toBeFocused();
  await confirm.getByRole("button", { name: "Cancel" }).click();
  await expect(confirm).toHaveCount(0);
  await expect(page.locator(".deck-card", { hasText: "Nami solo" })).toHaveCount(1);
  await expect(more).toBeFocused();

  await more.click();
  await page.getByRole("menuitem", { name: "Delete deck" }).click();
  await confirm.getByRole("button", { name: "Delete deck" }).click();
  await expect(page.locator(".deck-card", { hasText: "Nami solo" })).toHaveCount(0);
  await expect(page).toHaveURL(/\/decks$/);
});

test("Clicking the card opens the deck, and Edit opens it in edit mode (#1342)", async ({ page, planner }) => {
  await openDecks(page, planner, SOLO_AND_PAIR);
  await page.locator(".deck-card", { hasText: "Nami solo" }).getByRole("button", { name: "Edit" }).click();
  await expect(page).toHaveURL(/\/decks\/11\?edit=1/);
});

test("Add deck offers pasting a list, starting from a Leader and browsing Meta decks (#1342)", async ({ page, planner }) => {
  await openDecks(page, planner, SOLO_AND_PAIR);
  await page.getByRole("button", { name: "Add deck" }).click();
  await expect(page.getByRole("menuitem")).toHaveText([/Paste a deck list/, /Start from a Leader/, /Browse Meta decks/]);
  await page.getByRole("menuitem", { name: /Browse Meta decks/ }).click();
  await expect(page).toHaveURL(/\/meta$/);
});

test("Start from a Leader makes a deck holding just that Leader and opens it in edit mode (#1342)", async ({ page, planner }) => {
  await planner.open("/decks");
  await page.getByRole("button", { name: "Add deck" }).click();
  await page.getByRole("menuitem", { name: /Start from a Leader/ }).click();
  const dialog = page.getByRole("dialog", { name: "Pick a Leader" });
  const row = dialog.locator("[data-catalog-id='EB01-001']");
  await expect(row).toBeVisible();
  await expect(dialog.locator("[data-catalog-id='EB01-002']")).toHaveCount(0);
  await row.getByRole("button", { name: "Start deck" }).click();
  await expect(page).toHaveURL(new RegExp(`/decks/${DECK_ID}\\?edit=1`));
  expect(planner.createdDecks).toEqual([{ name: "Kouzuki Oden", decklist: "1xEB01-001" }]);
});

test("With no decks the empty state offers the same three ways in (#1342)", async ({ page, planner }) => {
  planner.noDecks();
  await planner.open("/decks");
  const empty = page.locator(".empty-state");
  await expect(empty.getByRole("link", { name: "Paste a deck list" })).toBeVisible();
  await expect(empty.getByRole("button", { name: "Start from a Leader" })).toBeVisible();
  await expect(empty.getByRole("link", { name: "Browse Meta decks" })).toBeVisible();
});
