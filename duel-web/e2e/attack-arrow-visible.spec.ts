/**
 * The battle attack arrow stays easy to see (#771): it keeps nearly full
 * strength while one of your prompts is open, and a dark outline under the
 * dashed trail keeps it readable on gold art, bright playmats and the light theme.
 * `?attacked&prompt=confirm` is an opposing Character attacking your Leader
 * with one of your choice prompts open.
 */
import { test, expect } from "./fixtures";

const PROMPT_DEMO = "/demo?attacked&prompt=confirm";

test("the attack arrow stays at least 70% opaque while your prompt is open (#771)", async ({ page }) => {
  await page.goto(PROMPT_DEMO);
  await page.locator(".board-root").waitFor();
  const overlay = page.locator(".attack-overlay");
  await expect(overlay).toHaveClass(/attack-dim/);
  // The opacity eases in over 0.15s; wait for it to settle.
  await expect
    .poll(async () => overlay.evaluate((el) => Number(getComputedStyle(el).opacity)))
    .toBeGreaterThanOrEqual(0.7);
});

test("the attack trail has a dark outline under it that is wider than the trail (#771)", async ({ page }) => {
  await page.goto("/demo?attacked");
  await page.locator(".board-root").waitFor();
  const outline = page.locator(".attack-overlay .atk-trail-outline");
  await expect(outline).toBeAttached();
  const trail = page.locator(".attack-overlay .atk-trail");
  const style = (loc: typeof outline) =>
    loc.evaluate((el) => {
      const cs = getComputedStyle(el);
      return { stroke: cs.stroke, width: parseFloat(cs.strokeWidth) };
    });
  const o = await style(outline);
  const t = await style(trail);
  const rgb = o.stroke.match(/\d+(\.\d+)?/g)!.slice(0, 3).map(Number);
  expect(Math.max(...rgb), `outline stroke ${o.stroke}`).toBeLessThan(60);
  expect(o.width).toBeGreaterThan(t.width);
});
