/**
 * Game-over reveal (#482): once the match is over, the opponent's hand and both
 * players' Life cards show face up. Driven by `/demo?over`, whose view carries the
 * `revealedHands` / `revealedLife` the game server adds after the game ends.
 */
import { test, expect } from "./fixtures";
import type { Page } from "@playwright/test";

const SHOTS = process.env.REVEAL_SHOTS_DIR;

async function shot(page: Page, name: string) {
  if (SHOTS) await page.screenshot({ path: `${SHOTS}/${name}.png` });
}

async function openOverBoard(page: Page) {
  await page.goto("/demo?over");
  await page.locator(".board-root").waitFor();
  await shot(page, `${test.info().project.name}-result-card`);
  await page.getByRole("button", { name: "View board" }).click();
}

// Some layouts keep a second (CSS-hidden) copy of the opponent hand mounted: count what shows.
const oppFaces = (page: Page) =>
  page.locator(".opp-hand-face, .opp-fan-face, .opp-corner-face, .opp-compact-face").filter({ visible: true });

test("after the match the opponent's hand and every Life card show face up (#482)", async ({ page }) => {
  await openOverBoard(page);
  await expect(oppFaces(page)).toHaveCount(6);
  await expect(oppFaces(page).first()).toBeVisible();
  // Desktop shows Life piles with face-up cards; phones show a count chip with "N↑".
  if (test.info().project.name.startsWith("desktop")) {
    await expect(page.locator(".side-opp .zone-pile-life .is-face-up").first()).toBeVisible();
    await expect(page.locator(".side-you .zone-pile-life .is-face-up").first()).toBeVisible();
  } else {
    await expect(page.getByLabel(/Opponent life: 5 cards, 5 face up/)).toBeVisible();
  }
  await shot(page, `${test.info().project.name}-board`);
  if (!test.info().project.name.startsWith("desktop")) {
    await page.setViewportSize({ width: 812, height: 375 });
    await expect(oppFaces(page).first()).toBeVisible();
    await shot(page, "phone-landscape-812x375-board");
  }
});
