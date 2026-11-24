import { test, expect, RED_LEGAL, FAKE_API, signInAs, type Page } from "./fixtures";

async function openRanked(page: Page) {
  // Ranked needs an account; a guest gets a sign-in sheet instead (#1391), so every caller signs in first.
  await page.addInitScript((deck) => {
    if (sessionStorage.getItem("e2e-seeded")) return;
    sessionStorage.setItem("e2e-seeded", "1");
    localStorage.clear();
    localStorage.setItem("optcg.duel.savedDecks.v1", JSON.stringify([{ id: "e2e-you", name: "E2E You", ...deck, updatedAt: 1 }]));
    localStorage.setItem("optcg.duel.selectedDeckId.v1", "e2e-you");
  }, RED_LEGAL);
  await page.goto("/");
  await page.locator(".mode-tiles").getByRole("button", { name: /^Ranked/ }).click();
}

test("Find match opens the board while the queue searches", async ({ page, duel: _duel }) => {
  await signInAs(page, { uid: 7, name: "Miko" });
  await openRanked(page);
  await expect(page).toHaveURL(/\/duel$/);
  const board = page.locator(".board-root.arena-pending");
  await expect(board.getByRole("status")).toContainText("Searching for an opponent");
  await expect(board.locator(".side-you .zone-leader .card-tile")).toBeVisible();

  await board.getByRole("button", { name: "Cancel" }).click();
  await expect(page).toHaveURL(/\/$/);
  await expect(page.locator(".btn-play")).toBeEnabled();
});

test("a failed match request returns to the lobby and says why", async ({ page, duel: _duel }) => {
  await signInAs(page, { uid: 7, name: "Miko" });
  await page.route(`${FAKE_API}/duel/token`, (route) =>
    route.fulfill({ status: 503, json: { detail: "Token service down" } }),
  );
  await openRanked(page);
  await expect(page.locator(".error-text")).toContainText("Token mint failed", { timeout: 30_000 });
  await expect(page).toHaveURL(/\/$/);
});

test("after Ranked once, one tap on Play Ranked searches for an opponent (#431, #1343)", async ({ page, duel: _duel }) => {
  await signInAs(page, { uid: 7, name: "Miko" });
  await openRanked(page);
  const board = page.locator(".board-root.arena-pending");
  await expect(board.getByRole("status")).toContainText("Searching for an opponent");
  await board.getByRole("button", { name: "Cancel" }).click();
  await expect(page).toHaveURL(/\/$/);

  const play = page.getByRole("button", { name: "Play Ranked", exact: true });
  await expect(play).toHaveAccessibleDescription("Last played");
  await play.click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(page.locator(".board-root.arena-pending").getByRole("status")).toContainText("Searching for an opponent");
});
