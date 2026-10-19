/**
 * Portrait phones: the hand is a fan (the Hand setting says Fan or Auto) however
 * many cards it holds, and Hide / Show works from the "Hand N" title row too.
 * Reported from a 440x479 phone: spamming Hide / Show left the hand a scrolling
 * Grid whatever the setting said (#445).
 */
import type { Page } from "@playwright/test";
import { test, expect } from "./fixtures";

const SIZES = [
  { width: 440, height: 479 },
  { width: 375, height: 812 },
];

async function tapCenter(page: Page, selector: string) {
  const box = await page.locator(selector).boundingBox();
  if (!box) throw new Error(`${selector} is not on screen`);
  await page.touchscreen.tap(box.x + box.width / 2, box.y + box.height / 2);
}

const handShape = (page: Page) =>
  page.evaluate(() => {
    const rail = document.querySelector(".hand-rail")!;
    const row = rail.querySelector<HTMLElement>(".hand-row")!;
    return {
      collapsed: rail.classList.contains("collapsed"),
      fan: row.classList.contains("hand-row-fan"),
      cards: [...row.querySelectorAll<HTMLElement>(".card-tile")].map((t) => {
        const r = t.getBoundingClientRect();
        return { left: r.left, right: r.right };
      }),
      vw: window.innerWidth,
    };
  });

for (const size of SIZES) {
  test(`a 11-card hand stays a fan after rapid Hide / Show taps at ${size.width}x${size.height} (#445)`, async ({ page }, info) => {
    test.skip(info.project.name !== "phone-375", "portrait phone behavior");
    await page.setViewportSize(size);
    await page.goto("/demo?full&hand=11");
    await page.locator(".hand-rail").waitFor();
    await expect(page.locator(".hand-row-fan .card-tile")).toHaveCount(11);

    // An odd number of taps ends collapsed, an even one open: finish open.
    for (let i = 0; i < 24; i++) await tapCenter(page, ".hand-collapse-btn");
    await expect(page.locator(".hand-rail.collapsed")).toHaveCount(0);

    const shape = await handShape(page);
    expect(shape.fan, "hand-row-fan class").toBe(true);
    expect(shape.cards).toHaveLength(11);
    // Overlapped: each card starts well inside the one before it, and all stay on screen.
    for (let i = 1; i < shape.cards.length; i++) {
      expect(shape.cards[i]!.left - shape.cards[i - 1]!.left).toBeLessThan(shape.cards[0]!.right - shape.cards[0]!.left);
    }
    expect(Math.min(...shape.cards.map((c) => c.left))).toBeGreaterThanOrEqual(0);
    expect(Math.max(...shape.cards.map((c) => c.right))).toBeLessThanOrEqual(shape.vw);
  });
}

test("tapping the Hand title row hides and shows the hand like the button (#445)", async ({ page }, info) => {
  test.skip(info.project.name !== "phone-375", "portrait phone behavior");
  await page.setViewportSize(SIZES[0]!);
  await page.goto("/demo?full");
  await page.locator(".hand-rail").waitFor();
  const toggle = page.locator(".hand-rail-toggle");
  // Web fonts change the button widths when they land; measure after.
  await page.evaluate(() => document.fonts.ready);
  const before = (await toggle.boundingBox())!;

  await tapCenter(page, ".hand-rail-toggle");
  await expect(page.locator(".hand-rail.collapsed")).toHaveCount(1);
  await expect(page.locator(".hand-collapse-btn")).toHaveText("Show");
  const folded = (await toggle.boundingBox())!;
  // Same size folded or open (it moves down with the rail, but it never grows or shrinks).
  expect(folded.width).toBeCloseTo(before.width, 0);
  expect(folded.height).toBeCloseTo(before.height, 0);

  await tapCenter(page, ".hand-rail-toggle");
  await expect(page.locator(".hand-rail.collapsed")).toHaveCount(0);
  await expect(page.locator(".hand-collapse-btn")).toHaveText("Hide");

  // The Sort button beside Hide does not fold the hand.
  await tapCenter(page, ".hand-rail-actions .hand-rail-btn:first-child");
  await expect(page.locator(".hand-rail.collapsed")).toHaveCount(0);
});
