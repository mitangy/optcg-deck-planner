/**
 * The "waiting for opponent" pill beside the board (#1193): in the dock's narrow slot (about 140px wide, 48px tall)
 * the bold title wrapped to two lines and the subtitle spilled under the pill's bottom border. Its text must stay
 * inside the pill at every desktop size, for every wait kind.
 */
import { test, expect, type Page } from "./fixtures";

test.use({ legacyLayout: false });

test.beforeEach(({}, info) => {
  test.skip(info.project.name !== "desktop-1280", "the dock beside the board is desktop only");
});

const SIZES = [
  { width: 1280, height: 720 },
  { width: 1440, height: 900 },
  { width: 1920, height: 1080 },
];

/** How far the text's line boxes poke out of the pill's content box (inside its border), per side; negative is room to spare. */
async function overflow(page: Page, kind: string, size: { width: number; height: number }) {
  await page.setViewportSize(size);
  await page.goto(`/demo?wait=${kind}`);
  await page.locator(".primary-dock .waiting-opp").waitFor();
  await page.waitForTimeout(400);
  return page.locator(".primary-dock .waiting-opp").evaluate((pill) => {
    const p = pill.getBoundingClientRect();
    const cs = getComputedStyle(pill);
    // Each line of text, clipped sideways to its own element: an ellipsised subtitle is cut there, so its hidden tail is not "outside".
    const lines: { top: number; bottom: number; left: number; right: number }[] = [];
    for (const el of pill.querySelectorAll(".waiting-opp-text > *")) {
      const box = el.getBoundingClientRect();
      const range = document.createRange();
      range.selectNodeContents(el);
      for (const r of range.getClientRects()) {
        if (r.width > 0 && r.height > 0) lines.push({ top: r.top, bottom: r.bottom, left: Math.max(r.left, box.left), right: Math.min(r.right, box.right) });
      }
    }
    return {
      top: p.top + parseFloat(cs.borderTopWidth) - Math.min(...lines.map((r) => r.top)),
      bottom: Math.max(...lines.map((r) => r.bottom)) - (p.bottom - parseFloat(cs.borderBottomWidth)),
      left: p.left + parseFloat(cs.borderLeftWidth) - Math.min(...lines.map((r) => r.left)),
      right: Math.max(...lines.map((r) => r.right)) - (p.right - parseFloat(cs.borderRightWidth)),
    };
  });
}

for (const size of SIZES) {
  for (const [kind, what] of [
    ["turn", "opponent's-turn"],
    ["effect", "waiting-for-opponent"],
  ] as const) {
    test(`the ${what} pill's text stays inside its box beside the board at ${size.width}x${size.height} (#1193)`, async ({ page }) => {
      const o = await overflow(page, kind, size);
      expect(o.top, "text above the pill's content box").toBeLessThanOrEqual(1);
      expect(o.bottom, "text below the pill's content box").toBeLessThanOrEqual(1);
      expect(o.left, "text left of the pill's content box").toBeLessThanOrEqual(1);
      expect(o.right, "text right of the pill's content box").toBeLessThanOrEqual(1);
    });
  }
}
