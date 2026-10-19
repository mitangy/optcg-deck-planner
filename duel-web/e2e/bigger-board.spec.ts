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

/** The normal-size layout, switched off by hand (it is on by default since #556). */
const OFF = { bigBoard: false, bigBoardChosen: true };

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

test.describe("defaults", () => {
  test.use({ legacyLayout: false });
  test("Bigger playing area is on by default, also for a stored false nobody chose, and stays off once chosen (#556)", async ({ page }) => {
    const vp = VIEWPORTS[0]!;
    // Nothing stored; and an older build's stored false that was never a choice.
    for (const stored of [{}, { bigBoard: false }]) {
      await openDemo(page, vp, "", stored);
      await expect(page.locator(".board-root"), JSON.stringify(stored)).toHaveClass(/arena-big/);
    }
    await openDemo(page, vp, "", OFF);
    await expect(page.locator(".board-root")).not.toHaveClass(/arena-big/);
  });
});

for (const vp of VIEWPORTS) {
  test(`Bigger playing area makes your mat and its cards bigger at ${vp.name} (#449)`, async ({ page }) => {
    await openDemo(page, vp, "", OFF);
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
    await openDemo(page, vp, "", OFF);
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

test("a column width dragged out in the normal layout does not carry into Bigger playing area, and comes back when it is off (#529)", async ({ page }) => {
  const saved = { ...OFF, panelSizes: "L=330;R=400", sideColumns: "both" };
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
  // The handles are there: a width dragged in this mode is saved apart (panelSizesBig).
  await expect(page.locator(".col-resize")).toHaveCount(2);
});

// A left / right opponent hand sits in a gutter beside the opponent's mat, and the
// mats shrink to leave it room (#529; it used to fall back to the top strip, #468).
for (const vp of [
  { width: 1280, height: 720 },
  { width: 1440, height: 900 },
  { width: 1920, height: 1080 },
]) {
  for (const spot of ["left", "right"] as const) {
    test(`with Bigger playing area a ${spot}-docked opponent hand sits beside the opponent mat, not over it or above it, at ${vp.width}x${vp.height} (#529)`, async ({ page, duel }, info) => {
      await openDemo(page, vp, "?full", { bigBoard: true, oppHandSpot: spot, previewPopup: false });
      await expect(page.locator(`.opp-hand-mat-${spot} .opp-hand-corner`)).toBeVisible();
      const hand = (await page.locator(".opp-hand-mat").boundingBox())!;
      const mat = (await page.locator(".side-field.side-opp").boundingBox())!;
      const own = (await page.locator(".side-field.side-you").boundingBox())!;
      if (process.env.SHOTS) {
        await page.screenshot({ path: `/mnt/project-files/card-preview-popup/opp-hand-big-${spot}-${vp.width}x${vp.height}-${process.env.OPP_SHOT ?? "after"}.png` });
      }
      // Beside, not above: it shares the mat's rows and sits wholly to one side of it.
      expect(hand.y, "hand starts within the opponent mat's rows").toBeGreaterThanOrEqual(mat.y - 1);
      expect(hand.y + hand.height, "hand ends within the opponent mat's rows").toBeLessThanOrEqual(mat.y + mat.height + 1);
      if (spot === "left") expect(hand.x + hand.width, "hand left of the mat").toBeLessThanOrEqual(mat.x + 1);
      else expect(hand.x, "hand right of the mat").toBeGreaterThanOrEqual(mat.x + mat.width - 1);
      // The mats shrank to make room instead of sliding under the hand: both stay clear of it.
      if (spot === "left") expect(own.x).toBeGreaterThanOrEqual(hand.x + hand.width - 1);
      else expect(own.x + own.width).toBeLessThanOrEqual(hand.x + 1);
      const vw = await page.evaluate(() => ({ s: document.documentElement.scrollWidth, w: window.innerWidth }));
      expect(vw.s, "no sideways scroll").toBeLessThanOrEqual(vw.w);
      const issues = (await duel.audit()).filter((i) => !isKnown(i));
      if (issues.length) await page.screenshot({ path: info.outputPath("audit.png") });
      expect(issues, formatIssues(issues)).toEqual([]);
    });
  }
}

// Ten DON!! in the cost area stand in one horizontal line: the cost area takes three columns of the
// mat, not two (#529).
for (const vp of [
  { width: 1280, height: 720 },
  { width: 1440, height: 900 },
  { width: 1920, height: 1080 },
  { width: 812, height: 375 },
  { width: 667, height: 375 },
]) {
  test(`with Bigger playing area ten DON!! share one row at ${vp.width}x${vp.height} (#529)`, async ({ page }) => {
    await openDemo(page, vp, "?don=10&dondeck=0&faceup=2", { bigBoard: true, previewPopup: false });
    const chips = page.locator(".side-you .don-strip .don-chip");
    await expect(chips).toHaveCount(10);
    if (process.env.SHOTS) {
      await page.screenshot({ path: `/mnt/project-files/card-preview-popup/don-row-${vp.width}x${vp.height}-${process.env.DON_SHOT ?? "after"}.png` });
    }
    const tops = await chips.evaluateAll((els) => els.map((e) => Math.round(e.getBoundingClientRect().top)));
    expect(Math.max(...tops) - Math.min(...tops), `chip tops ${tops.join(",")}`).toBeLessThanOrEqual(2);
    const strip = (await page.locator(".side-you .don-strip").boundingBox())!;
    const last = (await chips.last().boundingBox())!;
    expect(last.x + last.width, "last chip inside the strip").toBeLessThanOrEqual(strip.x + strip.width + 1);
    // Face-up Life is still on the mat to hover.
    await expect(page.locator(".side-you .zone-pile-life .zone-pile-face.is-face-up").first()).toBeVisible();
  });
}
