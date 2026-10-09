/**
 * Card spotlight (#339): a played or trashed card shows big over its owner's
 * half of the board, and the "Show played, trashed and drawn cards" switch hides it.
 * Driven by the `/demo?motion` steps, which send the events a server would.
 */
import { test, expect } from "./fixtures";
import type { Page } from "@playwright/test";

async function openMotionDemo(page: Page, settings: Record<string, unknown>) {
  await page.addInitScript((s) => localStorage.setItem("optcg-duel:settings", JSON.stringify(s)), settings);
  await page.goto("/demo?motion");
  await page.locator(".board-root").waitFor();
}

/** Click the demo's Next button until `label` is the step it just played. */
async function stepTo(page: Page, label: string) {
  const btn = page.locator(".motion-demo-btn");
  for (let i = 0; i < 20; i++) {
    const next = (await btn.textContent())?.replace(/^Next: /, "");
    await btn.click();
    if (next === label) return;
  }
  throw new Error(`no demo step "${label}"`);
}

test("the opponent's played card shows big over their half by default (#339)", async ({ page }) => {
  await openMotionDemo(page, {});
  await stepTo(page, "Opponent plays");
  const card = page.locator('.card-spotlight-card[data-def-id="ST01-006"]');
  await expect(card).toBeVisible();
  await expect(card.locator(".card-spotlight-label")).toHaveText("Played");
  await expect(page.locator(".card-spotlight-group")).toHaveAttribute("data-side", "opp");
  // Over the opponent's half, not yours.
  const spot = (await card.boundingBox())!;
  const opp = (await page.locator(".side-field.side-opp").boundingBox())!;
  expect(spot.y + spot.height / 2).toBeLessThan(opp.y + opp.height + 40);
  // It leaves on its own.
  await expect(page.locator(".card-spotlight-card")).toHaveCount(0, { timeout: 4000 });
});

test("a mill of three shows the trashed cards side by side inside the window (#339)", async ({ page }) => {
  await openMotionDemo(page, {});
  await stepTo(page, "Opponent trashes from deck");
  const cards = page.locator(".card-spotlight-card");
  await expect(cards).toHaveCount(3);
  const vw = page.viewportSize()!.width;
  for (let i = 0; i < 3; i++) {
    const box = (await cards.nth(i).boundingBox())!;
    expect(box.x).toBeGreaterThanOrEqual(0);
    expect(box.x + box.width).toBeLessThanOrEqual(vw);
  }
});

test("Show played and trashed cards off: a played card shows no spotlight (#339)", async ({ page }) => {
  await openMotionDemo(page, { cardSpotlight: false });
  await stepTo(page, "Opponent plays");
  await page.waitForTimeout(300);
  expect(await page.locator(".card-spotlight-layer").count()).toBe(0);
});

test("your Draw Phase card shows big over your half, then flies into your hand (#FEEDBACK)", async ({ page }) => {
  await openMotionDemo(page, {});
  await stepTo(page, "Draw");
  const card = page.locator('.card-spotlight-card[data-def-id="ST01-004"]');
  await expect(card).toBeVisible();
  await expect(card.locator(".card-spotlight-label")).toHaveText("Drew");
  await expect(page.locator(".card-spotlight-group")).toHaveAttribute("data-side", "you");
  // Sample the card's centre until it leaves; it must end at least half way to the hand.
  const path = await page.evaluate(
    () =>
      new Promise<{ start: [number, number]; end: [number, number]; hand: [number, number] | null }>((resolve) => {
        const centre = (r: DOMRect): [number, number] => [r.left + r.width / 2, r.top + r.height / 2];
        const el = document.querySelector(".card-spotlight-card");
        let start = centre(el!.getBoundingClientRect());
        let end = start;
        const tick = () => {
          const live = document.querySelector(".card-spotlight-card");
          if (live) {
            end = centre(live.getBoundingClientRect());
            requestAnimationFrame(tick);
            return;
          }
          const zone = document.querySelector(".hand-fan-cards, .rail-hand-cards, .hand-dock-cards, .hand-row");
          resolve({ start, end, hand: zone ? centre(zone.getBoundingClientRect()) : null });
        };
        requestAnimationFrame(tick);
      }),
  );
  expect(path.hand).not.toBeNull();
  const dist = (a: [number, number], b: [number, number]) => Math.hypot(a[0] - b[0], a[1] - b[1]);
  expect(dist(path.end, path.hand!)).toBeLessThan(dist(path.start, path.hand!) / 2);
});

test("Show cards off: your Draw Phase card shows no spotlight (#FEEDBACK)", async ({ page }) => {
  await openMotionDemo(page, { cardSpotlight: false });
  await stepTo(page, "Draw");
  await page.waitForTimeout(300);
  expect(await page.locator(".card-spotlight-layer").count()).toBe(0);
});
