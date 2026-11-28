import { test, expect, RED_LEGAL, FAKE_API, signInAs, type Page, pickMore } from "./fixtures";

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
  await pickMore(page, /^Ranked/);
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

async function openPlayNow(page: Page) {
  await page.addInitScript((deck) => {
    if (sessionStorage.getItem("e2e-seeded")) return;
    sessionStorage.setItem("e2e-seeded", "1");
    localStorage.clear();
    localStorage.setItem("optcg.duel.savedDecks.v1", JSON.stringify([{ id: "e2e-you", name: "E2E You", ...deck, updatedAt: 1 }]));
    localStorage.setItem("optcg.duel.selectedDeckId.v1", "e2e-you");
  }, RED_LEGAL);
  await page.goto("/");
  await page.locator(".btn-play").click();
}

test("Play now searches the casual queue as a guest, counts the time, and Cancel goes home (#1506)", async ({ page, duel: _duel }) => {
  const joined = page.waitForRequest(/\/matchmake\/joinOrCreate\/casual_queue/);
  await openPlayNow(page);
  await joined;
  await expect(page).toHaveURL(/\/duel$/);
  const board = page.locator(".board-root.arena-pending");
  await expect(board.getByRole("status")).toContainText("Searching for an opponent");
  const wait = board.getByRole("group", { name: "Finding an opponent" });
  await expect(wait).toContainText("Play now");
  await expect(wait.getByRole("timer")).toHaveAccessibleName(/Searching for 0:0\d/);
  await expect(wait.getByRole("button", { name: /Hard bot/ })).toHaveCount(0);
  await expect(board.getByRole("button", { name: "Cancel" })).toHaveCount(1);
  await board.getByRole("button", { name: "Cancel" }).click();
  await expect(page).toHaveURL(/\/$/);
  await expect(page.locator(".btn-play")).toBeEnabled();
});

test("after 45 s with nobody, Play a Hard bot instead leaves the queue and starts a Hard bot game with the chosen deck (#1506)", async ({ page, duel }, info) => {
  await page.clock.install();
  await openPlayNow(page);
  const wait = page.getByRole("group", { name: "Finding an opponent" });
  await expect(wait).toBeVisible();
  await page.clock.fastForward(30_000);
  await expect(wait.getByRole("button", { name: /Hard bot/ })).toHaveCount(0);
  await page.clock.fastForward(20_000);
  const offer = wait.getByRole("button", { name: "Play a Hard bot instead" });
  await expect(offer).toBeVisible();
  await offer.click();
  await expect(page.getByRole("button", { name: "Keep opening hand" })).toBeVisible({ timeout: 30_000 });
  if (info.project.name === "desktop-1280") await expect(page.locator(".board-root")).toContainText("Bot (Hard)");
  await expect(page.locator(".board-root .side-you .zone-leader .card-tile")).toBeVisible();
  expect(duel.errors).toEqual([]);
});

test("the Cancel button stays put when the bot offer appears (#1506)", async ({ page, duel: _duel }) => {
  await page.clock.install();
  await openPlayNow(page);
  const wait = page.getByRole("group", { name: "Finding an opponent" });
  const cancel = wait.getByRole("button", { name: "Cancel" });
  await expect(cancel).toBeVisible();
  const before = (await cancel.boundingBox())!;
  await page.clock.fastForward(50_000);
  await expect(wait.getByRole("button", { name: "Play a Hard bot instead" })).toBeVisible();
  const after = (await cancel.boundingBox())!;
  expect(Math.abs(after.y - before.y), "Cancel did not move").toBeLessThanOrEqual(1);
});
