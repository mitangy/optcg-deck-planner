/**
 * The default (bottom-middle) fanned hand: its buttons sit right beside the cards, and with Keep hand open the
 * board makes room for the raised fan (#1244).
 */
import { test, expect, type Page } from "./fixtures";

// This spec is about the new defaults (Bigger playing area on), so it skips the fixture's old-layout settings.
test.use({ legacyLayout: false });

test.beforeEach(({}, info) => {
  test.skip(info.project.name !== "desktop-1280", "the fan is desktop only");
});

async function openDemo(page: Page, settings: Record<string, unknown>) {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.addInitScript((s) => localStorage.setItem("optcg-duel:settings", JSON.stringify(s)), settings);
  await page.goto("/demo?full");
  await page.locator(".hand-fan-center .hand-fan-cards").waitFor();
  await page.waitForTimeout(500);
}

test("the bottom-middle hand's buttons sit beside its cards and stay put when it rises (#1244)", async ({ page }) => {
  await openDemo(page, { handLayout: "fan" });
  const head = page.locator(".hand-fan-center .hand-fan-head");
  const cards = page.locator(".hand-fan-center .hand-fan-cards");
  const tucked = (await head.boundingBox())!;
  const tuckedCards = (await cards.boundingBox())!;
  expect(tuckedCards.x - (tucked.x + tucked.width)).toBeLessThan(40);
  expect(tuckedCards.x).toBeGreaterThan(tucked.x + tucked.width);
  await cards.hover();
  await expect.poll(async () => (await cards.boundingBox())!.width).toBeGreaterThan(tuckedCards.width + 20);
  await page.waitForTimeout(400);
  const raised = (await head.boundingBox())!;
  expect(Math.abs(raised.x - tucked.x)).toBeLessThan(1);
});

test("Keep hand open moves the board up so the raised bottom-middle hand covers none of it (#1244)", async ({ page }) => {
  await openDemo(page, { handLayout: "fan", keepHandOpen: true });
  await expect(page.locator(".hand-fan-center")).toHaveClass(/is-open/);
  const mat = (await page.locator(".side-field.side-you").first().boundingBox())!;
  const cards = (await page.locator(".hand-fan-center .hand-fan-cards").boundingBox())!;
  expect(mat.y + mat.height).toBeLessThanOrEqual(cards.y);
});

test("with Keep hand open the bottom-middle hand's buttons stack in a column left of the cards and stay still (#1283)", async ({ page }) => {
  await openDemo(page, { handLayout: "fan", keepHandOpen: true });
  const fan = page.locator(".hand-fan-center");
  const head = page.locator(".hand-fan-center .hand-fan-head");
  const hand = head.locator(".hand-fan-toggle");
  const hide = head.locator(".hand-hide-btn");
  await expect(fan).toHaveClass(/is-open/);
  const handBox = (await hand.boundingBox())!;
  const hideBox = (await hide.boundingBox())!;
  // Stacked: Hide sits under Hand, not beside it.
  expect(hideBox.y).toBeGreaterThan(handBox.y + handBox.height - 1);
  expect(Math.abs(hideBox.x - handBox.x)).toBeLessThan(2);
  const cards = (await page.locator(".hand-fan-center .hand-fan-cards").boundingBox())!;
  const open = (await head.boundingBox())!;
  expect(open.x + open.width).toBeLessThan(cards.x);
  expect(cards.x - (open.x + open.width)).toBeLessThan(60);
  // The column sits within the raised cards' height and on screen, clear of the board.
  const mat = (await page.locator(".side-field.side-you").first().boundingBox())!;
  expect(open.y).toBeGreaterThanOrEqual(mat.y + mat.height);
  expect(open.y + open.height).toBeLessThanOrEqual(page.viewportSize()!.height);
  // Hide drops the cards; the buttons stay where they were.
  await hide.click();
  await expect(fan).toHaveClass(/is-hidden/);
  await page.waitForTimeout(600);
  const hidden = (await head.boundingBox())!;
  expect(Math.abs(hidden.y - open.y)).toBeLessThan(1);
  expect(Math.abs(hidden.x - open.x)).toBeLessThan(1);
});
