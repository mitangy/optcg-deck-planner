/**
 * Finding a match opens the board straight away: the ranked queue (and the
 * token mint before it) runs behind an empty playmat instead of a Connecting…
 * button. Nobody else queues here, so the search never ends on its own.
 */
import { test, expect, RED_VANILLA, FAKE_API, type Page } from "./fixtures";

async function openRanked(page: Page) {
  await page.addInitScript((deck) => {
    if (sessionStorage.getItem("e2e-seeded")) return;
    sessionStorage.setItem("e2e-seeded", "1");
    localStorage.clear();
    localStorage.setItem("optcg.duel.savedDecks.v1", JSON.stringify([{ id: "e2e-you", name: "E2E You", ...deck, updatedAt: 1 }]));
    localStorage.setItem("optcg.duel.selectedDeckId.v1", "e2e-you");
  }, RED_VANILLA);
  await page.goto("/");
  await page.getByRole("button", { name: "Play", exact: true }).click();
  await page.getByRole("button", { name: /^Ranked/ }).click();
  await page.getByRole("button", { name: "Find match" }).click();
}

test("Find match opens the board while the queue searches", async ({ page, duel: _duel }) => {
  await openRanked(page);
  await expect(page).toHaveURL(/\/duel$/);
  const board = page.locator(".board-root.arena-pending");
  await expect(board.getByRole("status")).toContainText("Searching for an opponent");
  // Your deck's Leader is already on the mat.
  await expect(board.locator(".side-you .zone-leader .card-tile")).toBeVisible();

  await board.getByRole("button", { name: "Cancel" }).click();
  await expect(page).toHaveURL(/\/$/);
  await expect(page.getByRole("button", { name: "Play", exact: true })).toBeEnabled();
});

test("a failed match request returns to the lobby and says why", async ({ page, duel: _duel }) => {
  // Registered after the fixture's fake API, so this route wins for the token mint.
  await page.route(`${FAKE_API}/duel/guest-token`, (route) =>
    route.fulfill({ status: 503, json: { detail: "Token service down" } }),
  );
  await openRanked(page);
  await expect(page.locator(".error-text")).toContainText("Token mint failed", { timeout: 30_000 });
  await expect(page).toHaveURL(/\/$/);
});
