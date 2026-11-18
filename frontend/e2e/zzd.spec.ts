import { test } from "./fixtures";
import { mockCardApi, ZORO } from "./cardPageFake";
const out = "/tmp/ux-shots/d";
for (const [w, h] of [[1280, 720], [1440, 900], [375, 812]] as [number, number][]) {
  test(`card ${w}x${h}`, async ({ page, planner }, info) => {
    test.skip(info.project.name !== "desktop-1200");
    await mockCardApi(page);
    await page.setViewportSize({ width: w, height: h });
    await planner.open(`/cards/${ZORO}`);
    await page.waitForTimeout(800);
    await page.screenshot({ path: `${out}/card-${w}x${h}.png`, fullPage: true });
  });
}
