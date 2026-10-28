/**
 * Desktop Life stack alignment (#768): Life spans two grid rows, so it used to
 * float vertically centred. It now sits at the top of your mat, level with the
 * Characters row, and the opponent's mat (turned 180°) mirrors it at the bottom.
 */
import { test, expect } from "./fixtures";
import type { Page } from "@playwright/test";

async function openDemo(page: Page, settings: Record<string, unknown>) {
  await page.addInitScript((s) => localStorage.setItem("optcg-duel:settings", JSON.stringify(s)), settings);
  await page.goto("/demo");
  await page.locator(".board-root").waitFor();
}

async function box(page: Page, selector: string) {
  const loc = page.locator(selector).first();
  await expect(loc).toBeVisible();
  return (await loc.boundingBox())!;
}

for (const [name, bigBoard] of [["bigBoard on", true], ["bigBoard off", false]] as const) {
  test(`Desktop Life sits at the top of your mat and the bottom of the opponent's, ${name} (#768)`, async ({ page }, info) => {
    test.skip(info.project.name !== "desktop-1280", "desktop layout only");
    await openDemo(page, { bigBoard, bigBoardChosen: true });
    const youLife = await box(page, ".side-you .zone-life");
    const youChars = await box(page, ".side-you .zone-characters");
    expect(Math.abs(youLife.y - youChars.y)).toBeLessThanOrEqual(2);
    const oppLife = await box(page, ".side-opp .zone-life");
    const oppChars = await box(page, ".side-opp .zone-characters");
    expect(Math.abs(oppLife.y + oppLife.height - (oppChars.y + oppChars.height))).toBeLessThanOrEqual(2);
  });
}

for (const [name, bigBoard] of [["bigBoard on", true], ["bigBoard off", false]] as const) {
  test(`Going 1st tag does not cover the Life stack on desktop, ${name} (#768)`, async ({ page }, info) => {
    test.skip(info.project.name !== "desktop-1280", "desktop layout only");
    await openDemo(page, { bigBoard, bigBoardChosen: true });
    const overlaps = (a: { x: number; y: number; width: number; height: number }, b: typeof a) =>
      a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height;
    for (const side of ["you", "opp"] as const) {
      const tag = await box(page, `.side-${side} .mat-order`);
      const life = await box(page, `.side-${side} .zone-pile-life`);
      expect(overlaps(tag, life), `${side} tag ${JSON.stringify(tag)} over Life ${JSON.stringify(life)}`).toBe(false);
      // Under your Life label, above the opponent's stack (their mat is mirrored).
      if (side === "you") expect(tag.y).toBeGreaterThanOrEqual(life.y + life.height - 1);
      else expect(tag.y + tag.height).toBeLessThanOrEqual(life.y + 1);
    }
  });
}

test("Landscape phones keep Life centred in its column (#768)", async ({ page }, info) => {
  test.skip(info.project.name !== "desktop-1280", "uses its own viewport");
  await page.setViewportSize({ width: 812, height: 375 });
  await openDemo(page, {});
  await expect(page.locator(".arena.arena-lp")).toBeVisible();
  const life = await box(page, ".side-you .zone-life");
  const chars = await box(page, ".side-you .zone-characters");
  // Centred spans two rows, so its top sits well below the Characters row's top.
  expect(life.y - chars.y).toBeGreaterThan(8);
});
