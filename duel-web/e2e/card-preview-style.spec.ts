/**
 * The desktop card preview panel has two looks (#348): a small card with stat
 * badges and keyword-chip text (default), or just a big card (Big card preview).
 */
import { test, expect, formatIssues } from "./fixtures";
import { isKnown } from "./known-issues";
import type { Page } from "@playwright/test";

async function openDemo(page: Page, settings: Record<string, unknown>) {
  await page.addInitScript((s) => localStorage.setItem("optcg-duel:settings", JSON.stringify(s)), settings);
  await page.goto("/demo");
  await page.locator(".board-root").waitFor();
}

const hoverLeader = (page: Page) => page.locator('.side-you [data-instance-id="y-leader"]').hover();

test("hovering a card shows a small card with its cost badge and effect text by default (#348)", async ({ page }) => {
  test.skip(test.info().project.name !== "desktop-1280", "the preview panel is a desktop side column");
  await openDemo(page, {});
  await hoverLeader(page);
  const panel = page.locator(".card-preview");
  await expect(panel).toHaveClass(/card-preview-compact/);
  await expect(panel.locator(".preview-badges [aria-label^='Life'], .preview-badges [aria-label^='Cost']")).toBeVisible();
  await expect(panel.locator(".card-preview-effect")).toBeVisible();
  await expect(panel.locator(".card-preview-effect .kw-chip").first()).toBeVisible();
});

const desktopOnly = () => test.skip(test.info().project.name !== "desktop-1280", "the preview panel is a desktop side column");

async function previewImgHeight(page: Page, settings: Record<string, unknown>) {
  await openDemo(page, settings);
  await hoverLeader(page);
  await expect(page.locator(".card-preview-img")).toBeVisible();
  return (await page.locator(".card-preview-img").boundingBox())!.height;
}

test("Big card preview shows only the art, larger than the small card, with no text block (#348)", async ({ page, context }) => {
  desktopOnly();
  const small = await previewImgHeight(page, {});
  const bigPage = await context.newPage();
  const big = await previewImgHeight(bigPage, { previewBigCard: true });
  expect(big).toBeGreaterThan(small * 1.5);
  const panel = bigPage.locator(".card-preview");
  await expect(panel).toHaveClass(/card-preview-big/);
  await expect(panel.locator(".card-preview-effect")).toHaveCount(0);
  await expect(panel.locator(".card-preview-name")).toHaveCount(0);
  // The art stays inside the block and the recent plays below it keep their place.
  const art = (await panel.locator(".card-preview-img").boundingBox())!;
  const box = (await panel.boundingBox())!;
  expect(art.y + art.height).toBeLessThanOrEqual(box.y + box.height + 1);
});

test("the Big card preview switch shows on desktop only and turns the big look on (#348)", async ({ page }) => {
  await page.goto("/settings");
  const toggle = page.getByLabel("Big card preview");
  if (test.info().project.name !== "desktop-1280") {
    await expect(page.getByLabel("Gray out unplayable cards")).toBeVisible();
    await expect(toggle).toHaveCount(0);
    return;
  }
  await expect(toggle).not.toBeChecked();
  await toggle.check();
  await page.goto("/demo");
  await page.locator(".board-root").waitFor();
  await hoverLeader(page);
  await expect(page.locator(".card-preview")).toHaveClass(/card-preview-big/);
});

test("a hovered card in the Big card preview passes the UI audit (#348)", async ({ page, duel }) => {
  desktopOnly();
  await openDemo(page, { previewBigCard: true });
  await hoverLeader(page);
  await expect(page.locator(".card-preview-big .card-preview-img")).toBeVisible();
  const issues = (await duel.audit()).filter((i) => !isKnown(i));
  expect(issues, formatIssues(issues)).toEqual([]);
});

test("a hovered card in the small card preview passes the UI audit (#348)", async ({ page, duel }) => {
  desktopOnly();
  await openDemo(page, {});
  await page.locator('.side-you [data-instance-id="y-stage"]').hover();
  await expect(page.locator(".card-preview-compact .card-preview-effect")).toContainText("On Play");
  const issues = (await duel.audit()).filter((i) => !isKnown(i));
  expect(issues, formatIssues(issues)).toEqual([]);
});
