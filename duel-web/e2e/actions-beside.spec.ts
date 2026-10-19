/**
 * "Buttons beside the board" (#556, #564): on a computer the dock (Keep / Mulligan, End turn ...) sits in a narrow
 * gutter against the right edge of the two playmats, its primary button centred on the line where the mats meet,
 * and the mats touch, so the board is the same size before and after the mulligan banner goes away.
 */
import { test, expect, keepBothHands, RED_VANILLA, type Page } from "./fixtures";

// This spec is about the new defaults, so it skips the fixture's old-layout settings.
test.use({ legacyLayout: false });

test.beforeEach(({}, info) => {
  test.skip(info.project.name !== "desktop-1280", "the dock beside the board is desktop only");
});

type Box = { left: number; top: number; right: number; bottom: number; width: number; height: number };

async function box(page: Page, sel: string): Promise<Box> {
  return page.locator(sel).first().evaluate((el) => {
    const r = el.getBoundingClientRect();
    return { left: r.left, top: r.top, right: r.right, bottom: r.bottom, width: r.width, height: r.height };
  });
}

async function openDemo(page: Page, query: string, settings: Record<string, unknown>, size?: { width: number; height: number }) {
  if (size) await page.setViewportSize(size);
  await page.addInitScript((s) => localStorage.setItem("optcg-duel:settings", JSON.stringify(s)), settings);
  await page.goto(`/demo${query}`);
  await page.locator(".primary-dock").waitFor();
  // The board lays out (and the old dock anchors itself) a frame or two after the media queries settle.
  await page.waitForTimeout(400);
}

const overlaps = (a: Box, b: Box) => a.left < b.right && b.left < a.right && a.top < b.bottom && b.top < a.bottom;

const SIZES = [
  { width: 1280, height: 720 },
  { width: 1920, height: 1080 },
];

for (const size of SIZES) {
  for (const bigBoard of [true, false]) {
    for (const query of ["?turn0", ""]) {
      test(`the dock hugs the mats' right edge with its primary on the seam on /demo${query} at ${size.width}x${size.height} with bigBoard ${bigBoard} (#564)`, async ({ page }) => {
        await openDemo(page, query, { bigBoard, bigBoardChosen: true, actionsBeside: true }, size);
        const opp = await box(page, ".side-opp");
        const you = await box(page, ".side-you");
        expect(you.top - opp.bottom, "gap between the mats").toBeLessThanOrEqual(4);
        expect(you.top - opp.bottom, "mats overlap").toBeGreaterThanOrEqual(-1);

        const dock = await box(page, ".primary-dock");
        const main = await box(page, ".primary-dock-main");
        // Directly against the mats' right edge, not in the side column.
        const matsRight = Math.max(opp.right, you.right);
        expect(dock.left - matsRight, "gap between the mats and the buttons").toBeGreaterThanOrEqual(0);
        expect(dock.left - matsRight, "gap between the mats and the buttons").toBeLessThanOrEqual(9);
        expect(await page.locator("[data-side-dock]").evaluate((el) => !!el.closest(".board-col"))).toBe(false);
        // The primary is centred on the seam; the Mulligan button stacks above it.
        expect(Math.abs((main.top + main.bottom) / 2 - opp.bottom), "primary centre vs the seam").toBeLessThanOrEqual(4);
        if (query === "?turn0") {
          const extra = await box(page, ".primary-dock .dock-extra");
          expect(extra.bottom, "Mulligan above the primary").toBeLessThanOrEqual(main.top);
          expect(extra.left).toBeCloseTo(main.left, 0);
          expect(extra.width).toBeCloseTo(main.width, 0);
          expect(extra.height).toBeCloseTo(main.height, 0);
        }
        // Clear of both mats and of every side column.
        const hits = [...(await page.locator(".side-field").evaluateAll((els) => els.map((e) => e.getBoundingClientRect()))), ...(await page.locator(".board-col").evaluateAll((els) => els.map((e) => e.getBoundingClientRect())))];
        for (const r of hits) expect(overlaps(dock, r as Box), "dock over a mat or a column").toBe(false);
        const caption = await box(page, ".dock-caption");
        expect(caption.top, "caption below the primary").toBeGreaterThanOrEqual(main.bottom - 1);
        expect(caption.left).toBeGreaterThanOrEqual(dock.left - 1);
        expect(caption.right).toBeLessThanOrEqual(dock.right + 1);
        for (const r of hits) expect(overlaps(caption, r as Box), "caption over a mat or a column").toBe(false);
        expect(caption.bottom, "caption stays on the board").toBeLessThanOrEqual(you.bottom + 1);
        expect(await page.locator(".primary-dock").evaluate((el) => getComputedStyle(el).position)).not.toBe("fixed");
      });
    }
  }
}

test("Keep and Mulligan stay inside the gutter and their own buttons at the largest text size (#564)", async ({ page }) => {
  await openDemo(page, "?turn0", { textSize: "xlarge", bigBoard: true, bigBoardChosen: true, actionsBeside: true });
  const dock = await box(page, ".primary-dock");
  const buttons = page.locator(".primary-dock button");
  await expect(buttons).toHaveCount(2);
  for (const b of await buttons.evaluateAll((els) =>
    els.map((el) => {
      const r = el.getBoundingClientRect();
      return { left: r.left, right: r.right, scrollW: el.scrollWidth, clientW: el.clientWidth, text: el.textContent };
    }),
  )) {
    expect(b.left, b.text ?? "").toBeGreaterThanOrEqual(dock.left - 1);
    expect(b.right, b.text ?? "").toBeLessThanOrEqual(dock.right + 1);
    expect(b.scrollW, `${b.text} spills out of its button`).toBeLessThanOrEqual(b.clientW + 1);
  }
});

for (const size of SIZES) {
  for (const bigBoard of [true, false]) {
    test(`the board is the same size on the mulligan screen as on a normal turn at ${size.width}x${size.height} with bigBoard ${bigBoard} (#564)`, async ({ page }) => {
      await openDemo(page, "?turn0", { actionsBeside: true, bigBoard, bigBoardChosen: true }, size);
      const mulligan = { opp: await box(page, ".side-opp"), you: await box(page, ".side-you"), main: await box(page, ".primary-dock-main") };
      await expect(page.locator(".mulligan-banner")).toHaveCount(0);
      await expect(page.locator(".primary-dock .dock-extra")).toHaveCount(1);
      await page.goto("/demo");
      await page.locator(".primary-dock").waitFor();
      await page.waitForTimeout(400);
      expect(await box(page, ".side-opp")).toEqual(mulligan.opp);
      expect(await box(page, ".side-you")).toEqual(mulligan.you);
      // The primary does not move either when Mulligan goes away.
      expect(await box(page, ".primary-dock-main")).toEqual(mulligan.main);
    });
  }
}

test("choosing Keep in a real match does not move or resize the playmats or the primary button (#564)", async ({ page, duel }) => {
  await duel.startPractice({ seed: 11, you: RED_VANILLA, opponent: RED_VANILLA });
  await expect(page.locator(".mulligan-banner")).toHaveCount(0);
  await page.waitForTimeout(400);
  const before = { opp: await box(page, ".side-opp"), you: await box(page, ".side-you"), main: await box(page, ".primary-dock-main") };
  // Placed against the mats once the match view arrives (the board is first drawn without a playmat).
  expect(before.main.left - before.you.right, "dock beside the mats from the first frame").toBeGreaterThanOrEqual(0);
  expect(before.main.left - before.you.right).toBeLessThanOrEqual(9);
  expect(Math.abs((before.main.top + before.main.bottom) / 2 - before.opp.bottom)).toBeLessThanOrEqual(4);
  await keepBothHands(page);
  await expect(page.getByRole("button", { name: "Keep opening hand" })).toHaveCount(0);
  await page.waitForTimeout(600);
  expect(await box(page, ".side-opp")).toEqual(before.opp);
  expect(await box(page, ".side-you")).toEqual(before.you);
  const main = await box(page, ".primary-dock-main");
  expect(main.top).toBe(before.main.top);
  expect(main.left).toBe(before.main.left);
  expect(main.height).toBe(before.main.height);
});

test("with the setting off the dock floats between the mats (#564)", async ({ page }) => {
  for (const query of ["?turn0", ""]) {
    await openDemo(page, query, { bigBoard: false, bigBoardChosen: true, actionsBeside: false });
    await expect(page.locator("[data-side-dock]")).toHaveCount(0);
    const opp = await box(page, ".side-opp");
    const you = await box(page, ".side-you");
    const dock = await box(page, ".primary-dock");
    expect(you.top - opp.bottom, "a strip between the mats").toBeGreaterThan(20);
    expect(dock.top).toBeGreaterThanOrEqual(opp.bottom - 1);
    expect(dock.bottom).toBeLessThanOrEqual(you.top + 1);
    expect(await page.locator(".primary-dock").evaluate((el) => getComputedStyle(el).position)).toBe("fixed");
  }
});
