import type { Page } from "@playwright/test";
import { expect, test } from "./fixtures";

test.afterEach(({ planner }) => {
  expect(planner.errors).toEqual([]);
});

const SHOTS = process.env.PR_SHOTS_DIR;
const IZO = "EB01-002";

function izoRow(page: Page) {
  return page.locator(".mobile-card:visible, .grid-card-wrap:visible, tr:visible").filter({ hasText: IZO }).first();
}

for (const vp of [
  { name: "phone-portrait", width: 375, height: 812, project: "phone-375" },
  { name: "phone-landscape", width: 812, height: 375, project: "phone-375" },
  { name: "desktop", width: 1200, height: 900, project: "desktop-1200" },
]) {
  test(`Shopping ${vp.name}: Owned is a −/+ stepper on a card with alt arts until an alt copy is owned (#1494)`, async ({ page, planner }, info) => {
    test.skip(info.project.name !== vp.project, vp.project);
    await page.setViewportSize({ width: vp.width, height: vp.height });
    planner.defaultDensity = true;
    planner.manyAlts(IZO, 2);
    await planner.open("/");
    const row = izoRow(page);
    await row.scrollIntoViewIfNeeded();
    const before = planner.owned.get(IZO) ?? 0;
    const inc = row.locator(".owned-wrap").getByRole("button", { name: "Increase owned", exact: true });
    await expect(inc).toBeVisible();
    if (SHOTS) await page.screenshot({ path: `${SHOTS}/owned-stepper-${vp.name}.png` });
    await inc.click();
    await expect.poll(() => planner.owned.get(IZO)).toBe(before + 1);
    await expect(row.locator("input.owned")).toHaveValue(String(before + 1));
  });
}
