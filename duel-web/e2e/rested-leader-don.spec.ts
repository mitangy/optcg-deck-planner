/**
 * A rested Leader reaches past its cell toward the DON!! cost area in the
 * two-row mats (desktop and landscape phone, Bigger playing area). The cost
 * area keeps its edge inset, so its gray box never sits under the Leader on
 * either mat. The viewports are set here, so the spec runs once (in the
 * desktop project).
 */
import { test, expect } from "./fixtures";

const VIEWPORTS = [
  { name: "desktop 1280x720", width: 1280, height: 720 },
  { name: "desktop 1440x900", width: 1440, height: 900 },
  { name: "phone landscape 812x375", width: 812, height: 375 },
];

test.beforeEach(({}, info) => {
  test.skip(info.project.name !== "desktop-1280", "sets its own viewports");
});

for (const vp of VIEWPORTS) {
  test(`A rested Leader stays clear of the DON!! cost area at ${vp.name} (#566)`, async ({ page }) => {
    await page.setViewportSize({ width: vp.width, height: vp.height });
    await page.addInitScript(() => localStorage.setItem("optcg-duel:settings", JSON.stringify({ bigBoard: true, bigBoardChosen: true })));
    await page.goto("/demo?restlead");
    await page.locator(".board-root").waitFor();
    await expect(page.locator(".board-root")).toHaveClass(/arena-big/);
    // The board lays out in a frame or two after the media queries settle.
    await page.waitForTimeout(400);

    const mats = await page.evaluate(() =>
      Array.from(document.querySelectorAll(".side-field")).map((side) => {
        const rect = (q: string) => {
          const r = side.querySelector(q)!.getBoundingClientRect();
          return { left: r.left, right: r.right, top: r.top, bottom: r.bottom };
        };
        return { name: side.className, leader: rect(".zone-leader .card-tile"), strip: rect(".don-strip") };
      }),
    );
    expect(mats).toHaveLength(2);
    for (const { name, leader, strip } of mats) {
      const overlapX = Math.min(leader.right, strip.right) - Math.max(leader.left, strip.left);
      const overlapY = Math.min(leader.bottom, strip.bottom) - Math.max(leader.top, strip.top);
      // Rested, the Leader is wider than tall; the strip must start where it ends.
      expect(overlapX > 0 && overlapY > 0, `${name}: Leader ${JSON.stringify(leader)} overlaps the DON!! area ${JSON.stringify(strip)}`).toBe(false);
    }
  });
}
