/**
 * Hiding a pop-up shrinks it into the "Back to …" pill instead of vanishing (#587): a copy
 * of the pop-up flies from its box into the pill, which pops in, then the copy is gone.
 * Reduced motion keeps the instant hide.
 *
 * SHOTS=1 also saves a mid-flight frame and the end state to /mnt/project-files/hide-shrink/.
 */
import { test, expect } from "./fixtures";
import type { Page } from "@playwright/test";

const SHOT_DIR = "/mnt/project-files/hide-shrink";
const GHOST = ".hide-shrink-ghost";
const PILL = ".float-return";

type Frame = { l: number; t: number; w: number; h: number } | null;

const PROMPTS = [
  { query: "selectgrid", box: ".prompt-hide-wrap .ability-prompt", hide: ".prompt-hide" },
  { query: "look", box: ".float-stage", hide: ".float-peek" },
] as const;

/** Click Hide while a page-side loop logs the copy's box every frame (a test-side poll could miss 280 ms). */
async function hideAndRecord(page: Page, hide: string, box: string) {
  const popup = (await page.locator(box).first().boundingBox())!;
  await page.evaluate((ghost) => {
    const w = window as unknown as { __frames: Frame[]; __done: boolean };
    w.__frames = [];
    w.__done = false;
    // The clock starts at the click, not at the recorder: a loaded machine can take a while to click.
    let t0 = 0;
    let seen = false;
    let gone = 0;
    document.addEventListener("click", () => (t0 ||= performance.now()), { capture: true, once: true });
    const tick = () => {
      const r = document.querySelector(ghost)?.getBoundingClientRect();
      w.__frames.push(r ? { l: r.left, t: r.top, w: r.width, h: r.height } : null);
      seen ||= !!r;
      gone = r ? 0 : gone + 1;
      const over = t0 > 0 && (seen ? gone >= 10 : performance.now() - t0 > 900);
      if (over || (t0 > 0 && performance.now() - t0 > 4000)) w.__done = true;
      else requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  }, GHOST);
  await page.locator(hide).first().click();
  await page.waitForFunction(() => (window as unknown as { __done: boolean }).__done);
  const frames = await page.evaluate(() => (window as unknown as { __frames: Frame[] }).__frames);
  return { popup, ghosts: frames.filter((f): f is NonNullable<Frame> => f != null), last: frames.slice(-10) };
}

const centre = (b: { l: number; t: number; w: number; h: number }) => ({ x: b.l + b.w / 2, y: b.t + b.h / 2 });

for (const p of PROMPTS) {
  test(`hiding the ${p.query} pop-up flies a copy of it into the Back pill and then removes it (#587)`, async ({ page }) => {
    await page.goto(`/demo?prompt=${p.query}`);
    await expect(page.locator(p.box).first()).toBeVisible();
    await page.waitForTimeout(500);
    const { popup, ghosts, last } = await hideAndRecord(page, p.hide, p.box);
    await expect(page.locator(PILL)).toBeVisible();
    const pill = (await page.locator(PILL).boundingBox())!;
    expect(ghosts.length).toBeGreaterThan(3);
    // It starts as big as the pop-up it came from ...
    expect(Math.abs(ghosts[0]!.w - popup.width)).toBeLessThan(popup.width * 0.2);
    // ... and ends smaller and nearer the pill.
    const first = ghosts[0]!;
    const end = ghosts[ghosts.length - 1]!;
    expect(end.w).toBeLessThan(first.w * 0.8);
    expect(end.h).toBeLessThan(first.h * 0.8);
    const to = { x: pill.x + pill.width / 2, y: pill.y + pill.height / 2 };
    const dist = (b: typeof first) => Math.hypot(centre(b).x - to.x, centre(b).y - to.y);
    expect(dist(end)).toBeLessThan(dist(first) * 0.7);
    // Gone afterwards.
    expect(last.every((f) => f === null)).toBe(true);
    await expect(page.locator(GHOST)).toHaveCount(0);
  });

  test(`hiding the ${p.query} pop-up with reduced motion is instant (#587)`, async ({ page }) => {
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.goto(`/demo?prompt=${p.query}`);
    await expect(page.locator(p.box).first()).toBeVisible();
    await page.waitForTimeout(500);
    const { ghosts } = await hideAndRecord(page, p.hide, p.box);
    await expect(page.locator(PILL)).toBeVisible();
    expect(ghosts).toHaveLength(0);
  });
}

if (process.env.SHOTS) {
  for (const [name, size, touch] of [
    ["1280x720", { width: 1280, height: 720 }, false],
    ["375x812", { width: 375, height: 812 }, true],
    ["812x375", { width: 812, height: 375 }, true],
  ] as const) {
    for (const p of PROMPTS) {
      test(`shots ${p.query} ${name}`, async ({ browser }) => {
        const ctx = await browser.newContext({ viewport: size, hasTouch: touch });
        const page = await ctx.newPage();
        await page.goto(`/demo?prompt=${p.query}`);
        await expect(page.locator(p.box).first()).toBeVisible();
        await page.waitForTimeout(600);
        await page.locator(p.hide).first().click();
        await page.evaluate(() => document.getAnimations().forEach((a) => { a.pause(); a.currentTime = 200; }));
        await page.screenshot({ path: `${SHOT_DIR}/${p.query}-${name}-mid.png` });
        await page.evaluate(() => document.getAnimations().filter((a) => a.playState === "paused").forEach((a) => a.play()));
        await page.waitForTimeout(800);
        await page.screenshot({ path: `${SHOT_DIR}/${p.query}-${name}-end.png` });
        await ctx.close();
      });
    }
  }
}
