/**
 * "Bigger playing area" (#449): with the switch on, the two playmats and the
 * cards on them take as much of the window as they can, on a desktop window,
 * a portrait phone and a landscape phone, without clipping anything or
 * scrolling sideways. The viewports are set here, so the spec runs once (in
 * the desktop project).
 */
import { test, expect, formatIssues, preferFan } from "./fixtures";
import { isKnown } from "./known-issues";
import type { Page } from "@playwright/test";

/** `twoRow`: the mats fold the DON!! cost area into the Leader row (#468), which is what makes the cards much bigger. */
const VIEWPORTS = [
  { name: "desktop 1280x720", width: 1280, height: 720, twoRow: true },
  { name: "phone portrait 375x812", width: 375, height: 812, twoRow: false },
  { name: "phone landscape 812x375", width: 812, height: 375, twoRow: true },
];

test.beforeEach(({}, info) => {
  test.skip(info.project.name !== "desktop-1280", "sets its own viewports");
});

async function openDemo(page: Page, vp: { width: number; height: number }, query: string, settings: Record<string, unknown>) {
  await page.setViewportSize({ width: vp.width, height: vp.height });
  await page.addInitScript((s) => localStorage.setItem("optcg-duel:settings", JSON.stringify(s)), settings);
  await page.goto(`/demo${query}`);
  await page.locator(".board-root").waitFor();
  // The board lays out in a frame or two after the media queries settle.
  await page.waitForTimeout(400);
}

/** Your mat and the first card on it, in px. */
async function mine(page: Page) {
  return page.evaluate(() => {
    const mat = document.querySelector(".side-you")!.getBoundingClientRect();
    const card = document.querySelector(".side-you .characters-row .card-tile")!.getBoundingClientRect();
    return { mat: mat.width, matH: mat.height, card: card.width };
  });
}

for (const vp of VIEWPORTS) {
  test(`Bigger playing area makes your mat and its cards bigger at ${vp.name} (#449)`, async ({ page }) => {
    await openDemo(page, vp, "", {});
    const off = await mine(page);
    await expect(page.locator(".board-root")).not.toHaveClass(/arena-big/);

    await openDemo(page, vp, "", { bigBoard: true });
    await expect(page.locator(".board-root")).toHaveClass(/arena-big/);
    const on = await mine(page);

    // A phone mat is already as wide as the screen, so it grows in height.
    expect(on.mat * on.matH, "mat area").toBeGreaterThan(off.mat * off.matH * 1.03);
    // Two-row mats (#468) grow the cards by a quarter or more; a portrait phone is width-bound and gains a little.
    expect(on.card, "card width").toBeGreaterThan(off.card * (vp.twoRow ? 1.25 : 1.05));
  });

  test(`Bigger playing area keeps the board clean and End turn reachable at ${vp.name} (#449)`, async ({ page, duel }, info) => {
    for (const query of ["", "?full", "?attack"]) {
      await preferFan(page);
      await openDemo(page, vp, query, { bigBoard: true });
      const issues = (await duel.audit()).filter((i) => !isKnown(i));
      if (issues.length) await page.screenshot({ path: info.outputPath(`audit-${query.slice(1) || "base"}.png`) });
      expect(issues, `${query || "/demo"}\n${formatIssues(issues)}`).toEqual([]);
      expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(vp.width);

      const end = page.getByRole("button", { name: /End turn/ }).first();
      await expect(end).toBeVisible();
      const box = (await end.boundingBox())!;
      expect(box.x).toBeGreaterThanOrEqual(0);
      expect(box.y).toBeGreaterThanOrEqual(0);
      expect(box.x + box.width).toBeLessThanOrEqual(vp.width);
      expect(box.y + box.height).toBeLessThanOrEqual(vp.height);
    }
    expect(duel.errors).toEqual([]);
  });
}

/**
 * Vertical centres of your cost area and DON!! deck against your Leader's top and bottom: they sit in the Leader's
 * row when both centres fall within it.
 */
async function leaderRow(page: Page) {
  return page.evaluate(() => {
    const box = (sel: string) => {
      const r = document.querySelector(`.side-you ${sel}`)!.getBoundingClientRect();
      return { top: r.top, bottom: r.bottom, mid: r.top + r.height / 2 };
    };
    return { leader: box(".zone-leader .card-tile"), cost: box(".zone-cost"), donDeck: box(".zone-don-deck") };
  });
}

for (const vp of VIEWPORTS.filter((v) => v.twoRow)) {
  test(`Bigger playing area folds your DON!! cost area and DON!! deck into the Leader's row at ${vp.name} (#468)`, async ({ page }) => {
    await openDemo(page, vp, "", {});
    const off = await leaderRow(page);
    // Off, they have a row of their own under the Leader.
    expect(off.cost.mid, "cost area below the Leader").toBeGreaterThan(off.leader.bottom);
    expect(off.donDeck.mid, "DON!! deck below the Leader").toBeGreaterThan(off.leader.bottom);

    await openDemo(page, vp, "", { bigBoard: true });
    const on = await leaderRow(page);
    for (const zone of ["cost", "donDeck"] as const) {
      expect(on[zone].mid, `${zone} centre under the Leader's top`).toBeGreaterThanOrEqual(on.leader.top);
      expect(on[zone].mid, `${zone} centre above the Leader's bottom`).toBeLessThanOrEqual(on.leader.bottom);
    }
  });
}

test("a column width dragged out does not fight Bigger playing area, and comes back when it is off (#449)", async ({ page }) => {
  const saved = { panelSizes: "L=330;R=400" };
  const colWidths = () =>
    page.evaluate(() => ({
      left: document.querySelector(".arena-left")!.getBoundingClientRect().width,
      right: document.querySelector(".arena-rail")!.getBoundingClientRect().width,
    }));
  await openDemo(page, VIEWPORTS[0]!, "", saved);
  const off = await colWidths();
  expect(off.left).toBeGreaterThan(300);
  expect(off.right).toBeGreaterThan(380);

  await openDemo(page, VIEWPORTS[0]!, "", { ...saved, bigBoard: true });
  const on = await colWidths();
  expect(on.left).toBeLessThan(260);
  expect(on.right).toBeLessThan(340);
  // No drag handle either: dragging one would save a width this mode ignores.
  await expect(page.locator(".col-resize")).toHaveCount(0);
});
