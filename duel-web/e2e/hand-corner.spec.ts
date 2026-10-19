/**
 * A shortened side column frees a corner for the fanned hand (#633): drag the bar on a column's bottom edge up, and
 * the hand sits in that corner, fully shown, never rising over the board. A column setting (panelSizes `LC` / `RC`),
 * desktop only: phones keep their layout whatever is saved.
 */
import { test, expect, formatIssues, type Page } from "./fixtures";
import { isKnown } from "./known-issues";

test.use({ legacyLayout: false });

type Box = { left: number; top: number; right: number; bottom: number };

async function open(page: Page, settings: Record<string, unknown>, query = "") {
  await page.addInitScript(
    (s) => localStorage.setItem("optcg-duel:settings", JSON.stringify(s)),
    { bigBoard: true, handLayout: "fan", ...settings },
  );
  await page.goto(`/demo${query}`);
  await page.locator(".board-root").waitFor();
  // The board lays out in a frame or two; the turn splash is gone after a moment.
  await page.waitForTimeout(500);
}

const box = (page: Page, sel: string) =>
  page.evaluate((s) => {
    const r = document.querySelector(s)!.getBoundingClientRect();
    return { left: r.left, top: r.top, right: r.right, bottom: r.bottom } as Box;
  }, sel);

const cardBoxes = (page: Page) =>
  page.locator(".hand-fan-cards > .card-tile").evaluateAll((els) =>
    els.map((el) => {
      const r = el.getBoundingClientRect();
      return { left: r.left, top: r.top, right: r.right, bottom: r.bottom };
    }),
  );

const saved = (page: Page) =>
  page.evaluate(() => JSON.parse(localStorage.getItem("optcg-duel:settings") ?? "{}").panelSizes as string | undefined);

test.describe("desktop", () => {
  test.beforeEach(({}, info) => {
    test.skip(info.project.name !== "desktop-1280", "desktop only");
  });

  for (const [w, h] of [[1280, 720], [1440, 900]] as const) {
    for (const hand of ["", "?hand=12"]) {
      test(`the hand sits in the corner under the shortened right column, clear of the board at ${w}x${h}${hand ? " with 12 cards" : ""} (#633)`, async ({ page }) => {
        await page.setViewportSize({ width: w, height: h });
        await open(page, { panelSizes: "RC=0.28" }, hand);
        await expect(page.locator(".hand-fan.hand-fan-corner")).toHaveCount(1);
        const mat = await box(page, ".side-you");
        const rail = await box(page, ".arena-rail");
        const fan = await box(page, ".hand-fan");
        const cards = await cardBoxes(page);
        expect(cards.length).toBeGreaterThan(0);

        // The column ends where the corner starts, 28% of the window up from the bottom.
        expect(Math.abs(rail.bottom - h * 0.72), "column bottom").toBeLessThan(3);
        expect(fan.top, "corner top is at or below the column's bottom edge").toBeGreaterThanOrEqual(rail.bottom - 1);
        for (const c of cards) {
          expect(c.left, `card ${JSON.stringify(c)} against your mat`).toBeGreaterThanOrEqual(mat.right - 1);
          expect(c.bottom, "card above the bottom of the window").toBeLessThanOrEqual(h + 1);
          expect(c.right, "card inside the right edge").toBeLessThanOrEqual(w + 1);
          expect(c.top, "card below the column").toBeGreaterThanOrEqual(rail.bottom - 1);
        }
      });
    }
  }

  test("in the normal-size board the corner gives back the strip the board keeps under it for a tucked hand (#633)", async ({ page }) => {
    await open(page, { bigBoard: false, bigBoardChosen: true, panelSizes: "RC=0.28" });
    await expect(page.locator(".hand-fan.hand-fan-corner")).toHaveCount(1);
    expect(await page.locator(".playmat").evaluate((el) => parseFloat(getComputedStyle(el).paddingBottom))).toBeLessThan(12);
  });

  test("hovering a card lifts that card only: the hand stays in its corner and off the board (#633)", async ({ page }) => {
    await open(page, { panelSizes: "RC=0.28" });
    const before = await box(page, ".hand-fan");
    const mat = await box(page, ".side-you");
    const rail = await box(page, ".arena-rail");
    const first = await cardBoxes(page);
    const target = page.locator(".hand-fan-cards > .card-tile").nth(3);
    const tb = (await target.boundingBox())!;
    await page.mouse.move(tb.x + tb.width / 2, tb.y + tb.height / 2);
    await page.waitForTimeout(400);
    expect(await box(page, ".hand-fan")).toEqual(before);
    const after = await cardBoxes(page);
    expect(first[3]!.top - after[3]!.top, "the hovered card lifts").toBeGreaterThan(8);
    for (const c of after) {
      expect(c.left).toBeGreaterThanOrEqual(mat.right - 1);
      expect(c.top).toBeGreaterThanOrEqual(rail.bottom - 20);
    }
  });

  test("the corner on the left column mirrors it, from the screen edge to your mat (#633)", async ({ page }) => {
    await open(page, { sideColumns: "both", panelSizes: "LC=0.28" });
    await expect(page.locator(".hand-fan.hand-fan-corner")).toHaveCount(1);
    const mat = await box(page, ".side-you");
    const left = await box(page, ".arena-left");
    const fan = await box(page, ".hand-fan");
    expect(Math.abs(left.bottom - 720 * 0.72)).toBeLessThan(3);
    expect(fan.left).toBeLessThanOrEqual(1);
    expect(fan.right).toBeLessThanOrEqual(mat.left);
    for (const c of await cardBoxes(page)) {
      expect(c.right, "card against your mat").toBeLessThanOrEqual(mat.left + 1);
      expect(c.left, "card inside the left edge").toBeGreaterThanOrEqual(-1);
    }
  });

  test("with both columns cut the right one holds the hand (#633)", async ({ page }) => {
    await open(page, { sideColumns: "both", panelSizes: "LC=0.3;RC=0.25" });
    const mat = await box(page, ".side-you");
    const fan = await box(page, ".hand-fan");
    expect(fan.left).toBeGreaterThanOrEqual(mat.right);
    expect(Math.abs(fan.top - 720 * 0.75)).toBeLessThan(3);
  });

  test("a cut on a column that is folded away, or a hand that is not a fan, changes nothing (#633)", async ({ page }) => {
    // One right column: the left cut has no column to shorten.
    await open(page, { sideColumns: "right", panelSizes: "LC=0.3" });
    await expect(page.locator(".hand-fan.hand-fan-center")).toHaveCount(1);
    await expect(page.locator(".hand-fan-corner")).toHaveCount(0);
    expect(await page.locator("[data-col-cut]").count()).toBe(0);
  });

  test("a moved hand keeps the place it was dragged to, the corner is only the default spot (#633)", async ({ page }) => {
    await open(page, { panelSizes: "RC=0.28", handFanPos: "0.45,0.6" });
    await expect(page.locator(".hand-fan.hand-fan-free")).toHaveCount(1);
    await expect(page.locator(".hand-fan-corner")).toHaveCount(0);
  });

  test("a hand dragged out stays in the corner (#633)", async ({ page }) => {
    await open(page, { panelSizes: "RC=0.28" });
    const before = await box(page, ".hand-fan");
    const c = (await page.locator(".hand-fan-cards > .card-tile").nth(2).boundingBox())!;
    await page.mouse.move(c.x + c.width / 2, c.y + c.height / 2);
    await page.mouse.down();
    await page.mouse.move(c.x - 200, c.y - 200, { steps: 8 });
    expect(await box(page, ".hand-fan")).toEqual(before);
    await page.mouse.up();
  });

  test("the bar on the column's bottom edge drags the cut, and dragging it back removes it (#633)", async ({ page }) => {
    await open(page, {});
    await expect(page.locator(".hand-fan.hand-fan-center")).toHaveCount(1);
    const bar = page.locator(".col-cut-right");
    await expect(bar).toHaveAttribute("role", "separator");
    await expect(bar).toHaveAttribute("aria-orientation", "horizontal");
    expect((await bar.boundingBox())!.height).toBeGreaterThanOrEqual(24);

    let b = (await bar.boundingBox())!;
    await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2);
    await page.mouse.down();
    await page.mouse.move(b.x + b.width / 2, 720 * 0.7, { steps: 10 });
    await page.mouse.up();
    await expect(page.locator(".hand-fan.hand-fan-corner")).toHaveCount(1);
    const cut = Number(/RC=([\d.]+)/.exec((await saved(page)) ?? "")?.[1]);
    expect(cut).toBeGreaterThan(0.27);
    expect(cut).toBeLessThan(0.33);
    const rail = await box(page, ".arena-rail");
    expect(Math.abs(rail.bottom - 720 * (1 - cut))).toBeLessThan(3);

    // The bar now sits on the column's bottom edge; dragging it back to the bottom removes the cut.
    b = (await bar.boundingBox())!;
    expect(Math.abs(b.y + b.height / 2 - rail.bottom)).toBeLessThan(3);
    await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2);
    await page.mouse.down();
    await page.mouse.move(b.x + b.width / 2, 715, { steps: 10 });
    await page.mouse.up();
    await expect(page.locator(".hand-fan.hand-fan-center")).toHaveCount(1);
    expect(await saved(page)).toBe("");
  });

  test("the bottom edge bar works from the keyboard: Up / Down step, Home and double-click remove (#633)", async ({ page }) => {
    await open(page, {});
    const bar = page.getByRole("separator", { name: /Resize right column bottom/ });
    await bar.focus();
    await page.keyboard.press("ArrowUp");
    expect(await saved(page)).toBe("RC=0.18");
    await page.keyboard.press("ArrowUp");
    expect(await saved(page)).toBe("RC=0.21");
    await expect(bar).toHaveAttribute("aria-valuenow", "21");
    await page.keyboard.press("ArrowDown");
    expect(await saved(page)).toBe("RC=0.18");
    await page.keyboard.press("ArrowDown");
    expect(await saved(page)).toBe("");
    await page.keyboard.press("ArrowUp");
    await page.keyboard.press("Home");
    expect(await saved(page)).toBe("");
    await page.keyboard.press("ArrowUp");
    await bar.dblclick();
    expect(await saved(page)).toBe("");
  });

  test("with Drag handles off the bar is gone but a saved cut still applies (#633)", async ({ page }) => {
    await open(page, { layoutGrips: false, panelSizes: "RC=0.28" });
    await expect(page.locator(".col-cut")).toHaveCount(0);
    await expect(page.locator(".hand-fan.hand-fan-corner")).toHaveCount(1);
  });

  test("Hide folds the corner hand away to its head row, Show brings it back (#633)", async ({ page }) => {
    await open(page, { panelSizes: "RC=0.28", keepHandOpen: true });
    const cards = page.locator(".hand-fan-cards");
    await expect(cards).toBeVisible();
    await page.getByRole("button", { name: "Hide" }).click();
    await expect(cards).toBeHidden();
    await expect(page.locator(".hand-fan-head")).toBeVisible();
    await page.getByRole("button", { name: "Show" }).click();
    await expect(cards).toBeVisible();
  });

  test("the corner passes the UI audit (#633)", async ({ page, duel }) => {
    await open(page, { panelSizes: "RC=0.28" }, "?full");
    const issues = (await duel.audit()).filter((i) => !isKnown(i));
    expect(issues, formatIssues(issues)).toEqual([]);
    expect(duel.errors).toEqual([]);
  });
});

test.describe("phones", () => {
  test("a saved cut changes nothing on a phone: no bar, no corner, no shortened column (#633)", async ({ page }, info) => {
    test.skip(info.project.name !== "phone-375", "portrait phone");
    await open(page, { panelSizes: "RC=0.28;LC=0.3" });
    await expect(page.locator(".col-cut")).toHaveCount(0);
    await expect(page.locator(".hand-fan-corner")).toHaveCount(0);
    expect(await page.locator("[data-col-cut]").count()).toBe(0);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  });
});
