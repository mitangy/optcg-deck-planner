/**
 * The mulligan banner floats over the top of the board (#1282): showing it must
 * not push the playmats down, so the board does not jump when it goes away.
 * `?turn0` is the demo's undecided opening hand; with Opening hand tips on the
 * banner shows, with them off there is none, so the two boards must match.
 */
import { test, expect } from "./fixtures";
import type { Page } from "@playwright/test";

async function matBoxes(page: Page, settings: Record<string, unknown>) {
  await page.addInitScript((s) => localStorage.setItem("optcg-duel:settings", JSON.stringify(s)), settings);
  await page.goto("/demo?turn0&pickedby=coin");
  await page.locator(".side-opp").waitFor();
  await page.waitForTimeout(400);
  const box = async (sel: string) => {
    const b = await page.locator(sel).first().boundingBox();
    return b && { x: Math.round(b.x), y: Math.round(b.y), w: Math.round(b.width), h: Math.round(b.height) };
  };
  return { banner: await page.locator(".mulligan-banner").count(), opp: await box(".side-opp"), you: await box(".side-you") };
}

for (const vp of [null, { width: 812, height: 375 }]) {
  test(`the mulligan banner floats over the board without moving it${vp ? ` at ${vp.width}x${vp.height}` : ""} (#1282)`, async ({ browser }, info) => {
    test.skip(vp != null && info.project.name !== "phone-375", "landscape is a phone layout");
    const viewport = vp ?? info.project.use.viewport!;
    const open = async (gameHints: boolean) => {
      const ctx = await browser.newContext({ viewport, hasTouch: info.project.use.hasTouch });
      try {
        return await matBoxes(await ctx.newPage(), { gameHints, actionsBeside: false });
      } finally {
        await ctx.close();
      }
    };
    const withBanner = await open(true);
    const without = await open(false);
    // The data has to tell the two apart: one board has the banner, one does not.
    expect(withBanner.banner).toBe(1);
    expect(without.banner).toBe(0);
    expect(withBanner.opp).toEqual(without.opp);
    expect(withBanner.you).toEqual(without.you);
  });
}
