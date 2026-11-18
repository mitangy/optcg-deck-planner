import { test } from "./fixtures";
const out = "/tmp/ux-shots/d";
for (const [w, h] of [[1440, 900], [375, 812]] as [number, number][]) {
  test(`landing ${w}x${h}`, async ({ page, planner }, info) => {
    test.skip(info.project.name !== "desktop-1200");
    planner.signOut();
    await page.setViewportSize({ width: w, height: h });
    await planner.open("/");
    await page.waitForTimeout(800);
    await page.screenshot({ path: `${out}/landing-${w}x${h}.png`, fullPage: true });
  });
}
