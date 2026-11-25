import type { Page } from "@playwright/test";
import { expect, test } from "./fixtures";

test.afterEach(({ planner }) => {
  expect(planner.errors).toEqual([]);
});

const SHOTS = process.env.PR_SHOTS_DIR;
const IZO = "EB01-002";

async function openTray(page: Page) {
  await page.getByRole("group", { name: "List density" }).getByRole("button", { name: "Compact" }).click();
  const toggle = page.getByRole("button", { name: /\d+ alts?/ }).locator("visible=true").first();
  await toggle.click();
  await expect(page.locator(".alt-art:visible").first()).toBeVisible();
}

async function stepperOverflow(page: Page) {
  return page.locator(".alt-art:visible").evaluateAll((tiles) =>
    tiles.flatMap((t) => {
      const r = t.getBoundingClientRect();
      const border = parseFloat(getComputedStyle(t).borderRightWidth) || 0;
      return [...t.querySelectorAll(".owned-btn, .alt-want-qty")].map((b) => {
        const br = b.getBoundingClientRect();
        return { label: b.getAttribute("aria-label") ?? b.textContent ?? "", over: Math.round((br.right - (r.right - border)) * 10) / 10 };
      });
    }),
  );
}

for (const vp of [
  { name: "portrait", width: 390, height: 844 },
  { name: "portrait-375", width: 375, height: 812 },
  { name: "landscape", width: 844, height: 390 },
]) {
  test(`Phone ${vp.name} Shopping Compact: alt tile thumbs stay small so the Owned stepper fits inside the tile (#1467)`, async ({ page, planner }, info) => {
    test.skip(info.project.name !== "phone-375", "phone layout");
    await page.setViewportSize({ width: vp.width, height: vp.height });
    planner.manyAlts(IZO, 2);
    await planner.open("/");
    await openTray(page);
    const rows = await stepperOverflow(page);
    expect(rows.length).toBeGreaterThan(3);
    for (const row of rows) expect(row.over, `${row.label} sticks out of its tile by ${row.over}px`).toBeLessThanOrEqual(0);
    if (SHOTS) {
      await page.locator(".alt-art:visible").first().scrollIntoViewIfNeeded();
      await page.screenshot({ path: `${SHOTS}/alt-stepper-${vp.name}.png` });
    }
  });
}
