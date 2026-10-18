/**
 * Play vs Bot (#631): Lobby → Play → Play vs Bot → Start game. The bot is the server's, so the board is a normal
 * online game: the bot answers the opening-hand choice, takes its own turn and hands the game back.
 */
import { test, expect, RED_VANILLA, type Page } from "./fixtures";

async function openBotSetup(page: Page, seed: number) {
  await page.route(`${process.env.E2E_GAME_SERVER ?? "http://127.0.0.1:2567"}/matchmake/create/**`, (route) => {
    const body = JSON.parse(route.request().postData() ?? "{}");
    return route.continue({ postData: JSON.stringify({ ...body, seed }) });
  });
  const decks = [
    { id: "e2e-you", name: "E2E You", ...RED_VANILLA, updatedAt: 1 },
    { id: "e2e-opp", name: "E2E Opponent", ...RED_VANILLA, updatedAt: 0 },
  ];
  await page.addInitScript((d) => {
    if (sessionStorage.getItem("e2e-seeded")) return;
    sessionStorage.setItem("e2e-seeded", "1");
    localStorage.clear();
    localStorage.setItem("optcg.duel.savedDecks.v1", JSON.stringify(d));
    localStorage.setItem("optcg.duel.selectedDeckId.v1", "e2e-you");
  }, decks);
  await page.goto("/");
  await page.getByRole("button", { name: "Play", exact: true }).click();
  await page.getByRole("dialog").getByRole("button", { name: /^Play vs Bot/ }).click();
}

test("Play vs Bot: the bot answers the opening hand and takes its turn (#631)", async ({ page, duel }, info) => {
  await openBotSetup(page, 7);
  // Normal is the default level, and the bot copies your deck unless you pick another.
  await expect(page.getByRole("radio", { name: "Normal" })).toHaveAttribute("aria-checked", "true");
  await expect(page.getByLabel("Bot's deck")).toHaveValue("");
  await page.getByRole("button", { name: "Start game" }).click();

  await expect(page.getByRole("button", { name: "Keep opening hand" })).toBeVisible({ timeout: 30_000 });
  // The player panel with both names is a desktop column; a phone shows no opponent name.
  if (info.project.name === "desktop-1280") await expect(page.locator(".board-root")).toContainText("Bot (Normal)");
  await page.getByRole("button", { name: "Keep opening hand" }).click();

  // Your first turn. Ending it hands the game to the bot, which plays turn 2 by itself and gives it back on turn 3.
  const root = page.locator(".board-root");
  await expect(root).toHaveAttribute("data-phase", "main", { timeout: 30_000 });
  await expect(root).toHaveAttribute("data-turn", "1");
  const end = page.locator(".intent-btn-primary", { hasText: /End turn/ });
  await end.click();
  const again = page.locator(".intent-btn-primary", { hasText: /(Tap|Click) again|End turn\?/ });
  if (await again.isVisible().catch(() => false)) await again.click();
  await expect(root).toHaveAttribute("data-turn", "3", { timeout: 30_000 });
  await expect(root).toHaveAttribute("data-phase", "main");
  expect(duel.errors).toEqual([]);
});
