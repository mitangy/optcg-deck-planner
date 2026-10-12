/**
 * "Buttons beside the board" (#556): on a computer the dock (Keep / Mulligan, End turn ...) sits in the side
 * column under Turn and clocks and the two playmats touch, so the board is the same size before and after the
 * mulligan banner goes away. With the setting off the dock floats in a strip between the mats as before.
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

async function openDemo(page: Page, query: string, settings: Record<string, unknown>) {
  await page.addInitScript((s) => localStorage.setItem("optcg-duel:settings", JSON.stringify(s)), settings);
  await page.goto(`/demo${query}`);
  await page.locator(".primary-dock").waitFor();
  // The board lays out (and the old dock anchors itself) a frame or two after the media queries settle.
  await page.waitForTimeout(400);
}

const overlaps = (a: Box, b: Box) => a.left < b.right && b.left < a.right && a.top < b.bottom && b.top < a.bottom;

for (const bigBoard of [true, false]) {
  for (const query of ["?turn0", ""]) {
    test(`the mats touch and the dock sits in the side column on /demo${query} with bigBoard ${bigBoard} (#556)`, async ({ page }) => {
      await openDemo(page, query, { bigBoard, bigBoardChosen: true, actionsBeside: true });
      const opp = await box(page, ".side-opp");
      const you = await box(page, ".side-you");
      expect(you.top - opp.bottom, "gap between the mats").toBeLessThanOrEqual(4);
      expect(you.top - opp.bottom, "mats overlap").toBeGreaterThanOrEqual(-1);

      const dock = await box(page, ".primary-dock");
      const slot = await box(page, '.arena-wide .board-panel[data-panel="actions"]');
      expect(dock.left, "dock inside the actions slot").toBeGreaterThanOrEqual(slot.left - 1);
      expect(dock.right).toBeLessThanOrEqual(slot.right + 1);
      expect(dock.top).toBeGreaterThanOrEqual(slot.top - 1);
      expect(dock.bottom).toBeLessThanOrEqual(slot.bottom + 1);
      expect(await page.locator(".primary-dock").evaluate((el) => getComputedStyle(el).position)).not.toBe("fixed");
      for (const mat of await page.locator(".side-field").evaluateAll((els) => els.map((e) => e.getBoundingClientRect()))) {
        expect(overlaps(dock, { ...mat, left: mat.left, top: mat.top, right: mat.right, bottom: mat.bottom } as Box), "dock over a mat").toBe(false);
      }
      // Nothing is cut off at the column's edge.
      const col = await box(page, ".arena-rail");
      expect(dock.right).toBeLessThanOrEqual(col.right);
      for (const btn of await page.locator(".primary-dock button").evaluateAll((els) => els.map((e) => e.getBoundingClientRect().right))) {
        expect(btn).toBeLessThanOrEqual(col.right);
      }
    });
  }
}

test("Keep and Mulligan stay inside the column and their own buttons at the largest text size (#556)", async ({ page }) => {
  await openDemo(page, "?turn0", { textSize: "xlarge", bigBoard: true, bigBoardChosen: true, actionsBeside: true });
  const col = await box(page, ".arena-rail");
  const buttons = page.locator(".primary-dock button");
  await expect(buttons).toHaveCount(2);
  for (const b of await buttons.evaluateAll((els) =>
    els.map((el) => {
      const r = el.getBoundingClientRect();
      return { left: r.left, right: r.right, scrollW: el.scrollWidth, clientW: el.clientWidth, text: el.textContent };
    }),
  )) {
    expect(b.left, b.text ?? "").toBeGreaterThanOrEqual(col.left);
    expect(b.right, b.text ?? "").toBeLessThanOrEqual(col.right);
    expect(b.scrollW, `${b.text} spills out of its button`).toBeLessThanOrEqual(b.clientW + 1);
  }
});

test("the board is the same size on the mulligan screen as on a normal turn (#556)", async ({ page }) => {
  await openDemo(page, "?turn0", { actionsBeside: true });
  const mulligan = { opp: await box(page, ".side-opp"), you: await box(page, ".side-you") };
  await expect(page.locator(".mulligan-banner")).toHaveCount(0);
  await expect(page.locator(".primary-dock .dock-extra")).toHaveCount(1);
  await page.goto("/demo");
  await page.locator(".primary-dock").waitFor();
  await page.waitForTimeout(400);
  expect(await box(page, ".side-opp")).toEqual(mulligan.opp);
  expect(await box(page, ".side-you")).toEqual(mulligan.you);
  });

test("choosing Keep in a real match does not move or resize the playmats (#556)", async ({ page, duel }) => {
  await duel.startPractice({ seed: 11, you: RED_VANILLA, opponent: RED_VANILLA });
  await expect(page.locator(".mulligan-banner")).toHaveCount(0);
  await page.waitForTimeout(400);
  const before = { opp: await box(page, ".side-opp"), you: await box(page, ".side-you") };
  const rowBefore = (await box(page, ".primary-dock")).height;
  await keepBothHands(page);
  await expect(page.getByRole("button", { name: "Keep opening hand" })).toHaveCount(0);
  await page.waitForTimeout(600);
  expect(await box(page, ".side-opp")).toEqual(before.opp);
  expect(await box(page, ".side-you")).toEqual(before.you);
  expect((await box(page, ".primary-dock")).height).toBe(rowBefore);
});

test("with the setting off the dock floats between the mats (#556)", async ({ page }) => {
  for (const query of ["?turn0", ""]) {
    await openDemo(page, query, { bigBoard: false, bigBoardChosen: true, actionsBeside: false });
    await expect(page.locator('[data-panel="actions"]')).toHaveCount(0);
    const opp = await box(page, ".side-opp");
    const you = await box(page, ".side-you");
    const dock = await box(page, ".primary-dock");
    expect(you.top - opp.bottom, "a strip between the mats").toBeGreaterThan(20);
    expect(dock.top).toBeGreaterThanOrEqual(opp.bottom - 1);
    expect(dock.bottom).toBeLessThanOrEqual(you.top + 1);
    expect(await page.locator(".primary-dock").evaluate((el) => getComputedStyle(el).position)).toBe("fixed");
  }
});
