/**
 * Hand reveals (#491): cards an effect revealed from a hand stay face up for the rest of the turn.
 * Driven by `/demo?reveal`, whose view carries the `handReveals` the rules engine adds: two of the
 * opponent's six hand cards and your first hand card.
 */
import { test, expect } from "./fixtures";
import type { Page } from "@playwright/test";

const SHOTS = process.env.HAND_REVEAL_SHOTS_DIR;

async function shot(page: Page, name: string) {
  // The demo's event log replays an "Opponent reveals" overlay on load; dismiss it so the shot shows the board.
  if (SHOTS) await page.addStyleTag({ content: ".reveal-overlay, .turn-splash { display: none !important; }" });
  if (SHOTS) await page.waitForTimeout(1200);
  if (SHOTS) await page.screenshot({ path: `${SHOTS}/${name}.png` });
}

// Some layouts keep a second (CSS-hidden) copy of the opponent hand mounted: count what shows.
const oppFaces = (page: Page) =>
  page.locator(".opp-hand-face, .opp-fan-face, .opp-corner-face, .opp-compact-face").and(page.locator(":not(.card-back)")).filter({ visible: true });
const oppBacks = (page: Page) =>
  page
    .locator(
      ".opp-hand-hint .card-back, .opp-hand-fan .card-back, .opp-hand-corner .card-back, .opp-hand-compact .card-back",
    )
    .filter({ visible: true });

async function openBoard(page: Page, spot = "") {
  await page.addInitScript((s) => localStorage.setItem("optcg-duel:settings", JSON.stringify({ oppHandSpot: s })), spot);
  await page.goto("/demo?reveal");
  await page.locator(".board-root").waitFor();
}

async function expectRevealed(page: Page, backs: number | null) {
  await expect(oppFaces(page).first()).toBeVisible();
  await expect(oppFaces(page)).toHaveCount(2);
  if (backs != null) await expect(oppBacks(page)).toHaveCount(backs);
  // Your own revealed card carries the marker, the others do not.
  const marker = page.locator(".hand-revealed-badge").filter({ visible: true });
  await expect(marker).toHaveCount(1);
  await expect(marker).toHaveAttribute("aria-label", "Revealed to opponent");
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  expect(overflow).toBeLessThanOrEqual(0);
}

test("revealed hand cards stay face up for the opponent and are marked in your hand (#491)", async ({ page }) => {
  const project = test.info().project.name;
  const desktop = project.startsWith("desktop");
  await openBoard(page);
  // The compact fan on a landscape phone shows the same 2 faces + 4 backs; portrait phones show a row of backs.
  await expectRevealed(page, desktop ? 4 : null);
  await shot(page, desktop ? "desktop-1280x720" : "phone-portrait-375x812");
  if (!desktop) {
    await page.setViewportSize({ width: 812, height: 375 });
    await expectRevealed(page, null);
    await shot(page, "phone-landscape-812x375");
  }
});

test("revealed cards also show when the opponent hand is pinned to a spot (#491)", async ({ page }) => {
  const project = test.info().project.name;
  for (const spot of ["centre", "left", "right"]) {
    await openBoard(page, spot);
    await expectRevealed(page, null);
    await shot(page, `${project}-spot-${spot}`);
  }
});
