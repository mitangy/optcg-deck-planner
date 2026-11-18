import { test, expect } from "./fixtures";
import type { Page } from "@playwright/test";

// No clean way to shut a real game server down from e2e, so the demo board takes the same prop the live page gets
// from the server_restarting message. The message -> store -> prop path is covered by unit tests.
async function open(page: Page, query: string) {
  await page.goto(`/demo?${query}`);
  await page.locator(".side-opp").waitFor();
  await page.waitForTimeout(400);
  const box = async (sel: string) => {
    const b = await page.locator(sel).first().boundingBox();
    return b && { x: Math.round(b.x), y: Math.round(b.y), w: Math.round(b.width), h: Math.round(b.height) };
  };
  const notice = (await page.locator(".restart-notice").count()) ? await box(".restart-notice") : null;
  return { opp: await box(".side-opp"), you: await box(".side-you"), notice };
}

for (const vp of [null, { width: 812, height: 375 }]) {
  test(`the restart notice floats inside the screen without moving the board${vp ? ` at ${vp.width}x${vp.height}` : ""} (#1352)`, async ({ browser }, info) => {
    test.skip(vp != null && info.project.name !== "phone-375", "landscape is a phone layout");
    const viewport = vp ?? info.project.use.viewport!;
    const shoot = async (query: string) => {
      const ctx = await browser.newContext({ viewport, hasTouch: info.project.use.hasTouch });
      try {
        return await open(await ctx.newPage(), query);
      } finally {
        await ctx.close();
      }
    };
    const warned = await shoot("restart");
    const calm = await shoot("calm");
    expect(calm.notice).toBeNull();
    expect(warned.notice).not.toBeNull();
    const n = warned.notice!;
    expect(n.x).toBeGreaterThanOrEqual(0);
    expect(n.y).toBeGreaterThanOrEqual(0);
    expect(n.x + n.w).toBeLessThanOrEqual(viewport.width);
    expect(warned.opp).toEqual(calm.opp);
    expect(warned.you).toEqual(calm.you);
  });
}
