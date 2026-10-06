/**
 * The primary dock (End turn, Keep / Mulligan) floats in the midline strip. The
 * strip is tall enough for it, so the buttons sit in the gap between the mats
 * and the divider diamond stays clear of them.
 */
import { test, expect, type Page } from "./fixtures";

type Box = { left: number; top: number; right: number; bottom: number };

async function boxes(page: Page, sel: string): Promise<Box[]> {
  return page.locator(sel).evaluateAll((els) =>
    els.map((el) => {
      const r = el.getBoundingClientRect();
      return { left: r.left, top: r.top, right: r.right, bottom: r.bottom };
    }),
  );
}

const overlaps = (a: Box, b: Box) =>
  a.left < b.right && b.left < a.right && a.top < b.bottom && b.top < a.bottom;

for (const screen of ["?turn0", "?cantattack"]) {
  test(`the dock sits between the mats and clear of the divider diamond on /demo${screen} (#368)`, async ({ page }, info) => {
    test.skip(info.project.name !== "desktop-1280", "the dock is desktop only");
    await page.goto(`/demo${screen}`);
    await page.locator(".primary-dock").waitFor();
    // The anchor settles on the next frame after the strip is measured.
    await page.waitForTimeout(300);
    const [dock] = await boxes(page, ".primary-dock");
    const [diamond] = await boxes(page, ".midline-ornament span");
    expect(dock, "dock").toBeTruthy();
    expect(diamond, "diamond").toBeTruthy();
    for (const mat of await boxes(page, ".side-field")) {
      expect(overlaps(dock!, mat), `dock ${JSON.stringify(dock)} over mat ${JSON.stringify(mat)}`).toBe(false);
    }
    expect(overlaps(dock!, diamond!), "dock over the diamond").toBe(false);
  });
}
