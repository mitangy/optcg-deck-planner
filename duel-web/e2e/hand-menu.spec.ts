/**
 * Fanned hand docked at the bottom centre: its menu, Hand and Sort controls
 * sit in one row right beside the cards (#1244; #449 had them stacked at the
 * column's far left, away from the cards), and stay on screen both while the
 * hand is tucked and while it is shown.
 */
import { test, expect, preferFan } from "./fixtures";
import type { Page } from "@playwright/test";

const CONTROLS = [".hand-fan-grip", ".hand-fan-toggle", ".hand-sort-btn"];

async function boxes(page: Page) {
  const out = [];
  for (const sel of CONTROLS) {
    const box = await page.locator(`.hand-fan-head ${sel}`).boundingBox();
    expect(box, sel).not.toBeNull();
    out.push(box!);
  }
  return out;
}

for (const state of ["tucked", "shown"] as const) {
  test(`docked fan: menu, Hand and Sort sit in a row beside the cards, ${state} (#1244)`, async ({ page }, info) => {
    test.skip(info.project.name !== "desktop-1280", "the fan is desktop only");
    await preferFan(page);
    await page.goto("/demo?cantattack");
    await page.locator(".board-root").waitFor();
    if (state === "shown") await page.locator(".hand-fan-cards").hover();
    else await page.mouse.move(5, 5);
    await page.waitForTimeout(800);

    const [menu, hand, sort] = await boxes(page);
    const vp = page.viewportSize()!;
    // One row: centres level, each control right of the one before it.
    const midY = (b: { y: number; height: number }) => b.y + b.height / 2;
    expect(Math.abs(midY(menu) - midY(hand))).toBeLessThan(3);
    expect(Math.abs(midY(hand) - midY(sort))).toBeLessThan(3);
    expect(menu.x + menu.width).toBeLessThanOrEqual(hand.x + 1);
    expect(hand.x + hand.width).toBeLessThanOrEqual(sort.x + 1);
    // Whole controls on screen, none clipped by the bottom edge.
    for (const b of [menu, hand, sort]) {
      expect(b.x).toBeGreaterThanOrEqual(0);
      expect(b.y).toBeGreaterThanOrEqual(0);
      expect(b.y + b.height).toBeLessThanOrEqual(vp.height);
    }
    // Same hit targets as before: the toggle and Sort keep their height.
    expect(hand.height).toBeGreaterThanOrEqual(27);
    expect(sort.height).toBeGreaterThanOrEqual(27);
    // Left of the first card, clear of it, and right beside the cards.
    const firstCard = (await page.locator(".hand-fan-cards > *").first().boundingBox())!;
    for (const b of [menu, hand, sort]) expect(b.x + b.width).toBeLessThanOrEqual(firstCard.x);
    expect(firstCard.x - (sort.x + sort.width)).toBeLessThan(60);
  });
}
