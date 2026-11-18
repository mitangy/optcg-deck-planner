import { test } from "./fixtures";
const out = "/tmp/ux-shots/d";
const sizes: [number, number][] = [[1280, 720], [1440, 900], [375, 812], [812, 375], [1920, 1080]];
for (const [w, h] of sizes) {
  test.setTimeout(20000); test(`lb ${w}x${h}`, async ({ page, planner }, info) => {
    test.skip(info.project.name !== "desktop-1200");
    await page.route(/tcgplayer-cdn.*in_1000x1000|_in_1000x1000/, (r) => r.fulfill({ path: "/tmp/d/art.png", contentType: "image/png" }));
    await page.setViewportSize({ width: w, height: h });
    await planner.open("/");
    await page.waitForTimeout(600);
    await page.getByTitle("Expand card").filter({ visible: true }).first().click();
    await page.waitForTimeout(800);
    await page.screenshot({ path: `${out}/lightbox-${w}x${h}.png` });
    if (w === 1280) {
      await page.getByRole("button", { name: /Price history/ }).click();
      await page.waitForTimeout(500);
      await page.screenshot({ path: `${out}/lightbox-hist-${w}x${h}.png` });
    }
  });
}
