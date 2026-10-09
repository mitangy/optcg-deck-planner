/**
 * Fanned hand docked at the bottom centre (#449): its menu, Hand and Sort
 * controls stand one under another at the fan's far left, instead of in a row,
 * and stay on screen both while the hand is tucked and while it is shown.
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
  test(`docked fan: menu, Hand and Sort stack in a column at the fan's left, ${state} (#449)`, async ({ page }, info) => {
    test.skip(info.project.name !== "desktop-1280", "the fan is desktop only");
    await preferFan(page);
    await page.goto("/demo?cantattack");
    await page.locator(".board-root").waitFor();
    if (state === "shown") await page.locator(".hand-fan-cards").hover();
    else await page.mouse.move(5, 5);
    await page.waitForTimeout(800);

    const [menu, hand, sort] = await boxes(page);
    const vp = page.viewportSize()!;
    // One column: left edges line up, each control under the one before it.
    expect(Math.abs(menu.x - hand.x)).toBeLessThan(3);
    expect(Math.abs(hand.x - sort.x)).toBeLessThan(3);
    expect(menu.y + menu.height).toBeLessThanOrEqual(hand.y + 1);
    expect(hand.y + hand.height).toBeLessThanOrEqual(sort.y + 1);
    // Whole controls on screen, none clipped by the bottom edge.
    for (const b of [menu, hand, sort]) {
      expect(b.x).toBeGreaterThanOrEqual(0);
      expect(b.y).toBeGreaterThanOrEqual(0);
      expect(b.y + b.height).toBeLessThanOrEqual(vp.height);
    }
    // Same hit targets as before: the toggle and Sort keep their height.
    expect(hand.height).toBeGreaterThanOrEqual(27);
    expect(sort.height).toBeGreaterThanOrEqual(27);
    // Left of the first card, clear of the cards.
    const firstCard = (await page.locator(".hand-fan-cards > *").first().boundingBox())!;
    for (const b of [menu, hand, sort]) expect(b.x + b.width).toBeLessThanOrEqual(firstCard.x);
  });
}
