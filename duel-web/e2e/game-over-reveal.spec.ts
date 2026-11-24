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

const oppFaces = (page: Page) =>
  page.locator(".opp-hand-face, .opp-fan-face, .opp-corner-face, .opp-compact-face").filter({ visible: true });

test("after the match the opponent's hand and every Life card show face up (#482)", async ({ page }) => {
  await openOverBoard(page);
  await expect(oppFaces(page)).toHaveCount(6);
  await expect(oppFaces(page).first()).toBeVisible();
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

test("on a landscape phone the match-over card fits the screen and scrolls inside itself (#966)", async ({ page }, info) => {
  test.skip(info.project.name !== "phone-375", "one run is enough: the viewport is set here");
  await page.setViewportSize({ width: 812, height: 375 });
  await page.goto("/demo?over");
  await page.locator(".board-root").waitFor();
  const card = page.locator(".modal-card.match-result");
  await expect(card).toBeVisible();
  const vp = page.viewportSize()!;
  const box = (await card.boundingBox())!;
  expect(box.y).toBeGreaterThanOrEqual(0);
  expect(box.y + box.height).toBeLessThanOrEqual(vp.height);
  await card.getByRole("button", { name: "Home" }).scrollIntoViewIfNeeded();
  await expect(card.getByRole("button", { name: "Home" })).toBeInViewport();
});
