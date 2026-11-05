/**
 * "Review game" on the match-over card (#965): once the saved match says its replay is ready, the card offers a
 * button that opens /replay/:matchId in the same tab. Opened straight from the card, a replay the server is still
 * saving (409) is retried behind a "Saving the game…" board instead of showing "Still being played".
 * Driven by `/demo?over` (its saved match has a replay); the FastAPI backend is faked in the browser.
 */
import { readFileSync } from "node:fs";
import { test, expect, signInAs, FAKE_API } from "./fixtures";
import type { Page } from "@playwright/test";

const GAME = JSON.parse(readFileSync(new URL("./data/replay-purple-red.json", import.meta.url), "utf8")) as Record<string, unknown>;
const SHOTS = process.env.REVIEW_SHOTS_DIR;

/** Answers the demo match's replay: 409 ("still saving") until `release()`, then the recording. */
async function fakeReplay(page: Page, saving: boolean): Promise<{ release: () => void }> {
  let busy = saving;
  await page.route(`${FAKE_API}/duel/matches/me/**/replay`, (route) =>
    busy ? route.fulfill({ status: 409, json: { detail: "This game is still being played" } }) : route.fulfill({ json: GAME }),
  );
  return { release: () => void (busy = false) };
}

test("Review game opens the replay in the same tab (#965)", async ({ page }) => {
  await signInAs(page, { uid: 1, name: "Zoro Fan" });
  await fakeReplay(page, false);
  await page.goto("/demo?over");
  const review = page.getByRole("link", { name: "Review game" });
  await expect(review).toBeVisible();
  if (SHOTS) await page.screenshot({ path: `${SHOTS}/${test.info().project.name}-card.png` });
  await review.click();
  await expect(page).toHaveURL(/\/replay\/[^/]+$/);
  await expect(page.getByRole("group", { name: "Replay controls" })).toBeVisible({ timeout: 30_000 });
});

test("a replay that is still saving is retried behind 'Saving the game…' (#965)", async ({ page }) => {
  await signInAs(page, { uid: 1, name: "Zoro Fan" });
  const replay = await fakeReplay(page, true);
  await page.goto("/demo?over");
  await page.getByRole("link", { name: "Review game" }).click();
  await expect(page.locator(".hud-phase", { hasText: "Saving the game…" })).toBeVisible();
  await expect(page.getByText("Still being played")).toHaveCount(0);
  replay.release();
  await expect(page.getByRole("group", { name: "Replay controls" })).toBeVisible({ timeout: 30_000 });
});

test("opened any other way, an in-progress replay shows the notice at once (#965)", async ({ page }) => {
  await signInAs(page, { uid: 1, name: "Zoro Fan" });
  await fakeReplay(page, true);
  await page.goto("/replay/m1");
  await expect(page.getByRole("heading", { name: "Still being played" })).toBeVisible();
  await expect(page.locator(".hud-phase", { hasText: "Saving the game…" })).toHaveCount(0);
});
