/**
 * Docking the choice pop-up into a side column (#449): drag its header onto a
 * column (or use the dock buttons), it sits at the top of that column with the
 * other panels shrunk, picks survive, the side is remembered, and phones keep
 * their floating pop-up.
 */
import { test, expect } from "./fixtures";
import type { Page } from "@playwright/test";

const PROMPT = ".prompt-hide-wrap .ability-prompt";
const SETTINGS = "optcg-duel:settings";
const desktop = () => test.info().project.name === "desktop-1280";

const stored = (page: Page) =>
  page.evaluate((key) => JSON.parse(localStorage.getItem(key) ?? "{}") as Record<string, unknown>, SETTINGS);

async function open(page: Page, prompt = "order") {
  await page.goto(`/demo?prompt=${prompt}`);
  await expect(page.locator(PROMPT)).toBeVisible();
}

/** Drag the header by the mouse to (x, y). */
async function dragHeaderTo(page: Page, x: number, y: number) {
  const h = (await page.locator(`${PROMPT} > h3`).boundingBox())!;
  await page.mouse.move(h.x + 40, h.y + h.height / 2);
  await page.mouse.down();
  await page.mouse.move(x, y, { steps: 8 });
  await page.mouse.up();
}

const box = async (page: Page, selector: string) => (await page.locator(selector).first().boundingBox())!;

/** The pop-up lies inside the column's box, at its top. */
async function expectDockedIn(page: Page, side: "left" | "right") {
  await expect
    .poll(async () => {
      const col = await box(page, `[data-panel-col="${side}"]`);
      const p = await box(page, PROMPT);
      return p.x >= col.x - 1 && p.x + p.width <= col.x + col.width + 1 && p.y < col.y + 30;
    })
    .toBe(true);
}

test.describe("desktop", () => {
  test.beforeEach(() => test.skip(!desktop(), "side columns are desktop only"));

  for (const [side, panel] of [
    ["right", "hand"],
    ["left", "log"],
  ] as const) {
    test(`dragging the header onto the ${side} column docks it there, shrinks that column's panels, and the next pop-up opens docked (#449)`, async ({ page }) => {
      await page.addInitScript((key) => {
        // Only the first load: a reload keeps what the page saved.
        if (!localStorage.getItem(key)) localStorage.setItem(key, JSON.stringify({ handLayout: "grid" }));
      }, SETTINGS);
      await open(page);
      const before = await box(page, `[data-panel="${panel}"]`);
      const col = await box(page, `[data-panel-col="${side}"]`);
      await dragHeaderTo(page, col.x + col.width / 2, col.y + col.height / 2);
      await expectDockedIn(page, side);
      expect((await stored(page)).promptDock).toBe(side);
      await expect.poll(async () => (await box(page, `[data-panel="${panel}"]`)).height).toBeLessThan(before.height - 100);
      // The demo keeps one pop-up up, so a reload (a fresh pop-up, settings kept) stands in for the next.
      await page.reload();
      await expect(page.locator(PROMPT)).toBeVisible();
      await expectDockedIn(page, side);
    });
  }

  test("the screen's edge docks too, and dragging a docked pop-up out floats it where it was dropped (#449)", async ({ page }) => {
    await open(page);
    await dragHeaderTo(page, 1279, 300);
    await expectDockedIn(page, "right");
    const h = await box(page, `${PROMPT} > h3`);
    // Out over the board, well past the pull-loose threshold.
    await dragHeaderTo(page, h.x - 500, h.y + 200);
    await expect.poll(async () => (await stored(page)).promptDock).toBe("");
    await expect(page.locator("[data-prompt-dock-host]")).toHaveCount(0);
    const after = await box(page, PROMPT);
    expect(after.x + after.width).toBeLessThan((await box(page, `[data-panel-col="right"]`)).x + 1);
    expect(after.y).toBeGreaterThan(h.y + 100);
  });

  test("the dock buttons dock and undock, and the picks made so far are kept (#449)", async ({ page }) => {
    await open(page);
    const bottom = page.getByRole("group", { name: "Place Jesus Burgess" }).getByRole("button", { name: "Bottom" });
    await bottom.click();
    await expect(bottom).toHaveAttribute("aria-pressed", "true");
    await page.locator(`${PROMPT} [data-dock="left"]`).click();
    await expectDockedIn(page, "left");
    await expect(bottom).toHaveAttribute("aria-pressed", "true");
    await page.locator(`${PROMPT} [data-dock="right"]`).click();
    await expectDockedIn(page, "right");
    await expect(bottom).toHaveAttribute("aria-pressed", "true");
    await page.locator(`${PROMPT} [data-dock="right"]`).click();
    await expect.poll(async () => (await stored(page)).promptDock).toBe("");
    await expect(page.locator("[data-prompt-dock-host]")).toHaveCount(0);
    await expect(bottom).toHaveAttribute("aria-pressed", "true");
  });

  test("a column shows a drop hint while the header is dragged over it, and not after (#449)", async ({ page }) => {
    await open(page);
    const h = (await box(page, `${PROMPT} > h3`));
    const col = await box(page, `[data-panel-col="left"]`);
    await page.mouse.move(h.x + 40, h.y + h.height / 2);
    await page.mouse.down();
    await page.mouse.move(col.x + col.width / 2, col.y + 200, { steps: 8 });
    await expect(page.locator(`[data-panel-col="left"][data-prompt-drop]`)).toHaveCount(1);
    await expect(page.locator(`[data-panel-col="right"][data-prompt-drop]`)).toHaveCount(0);
    await page.mouse.up();
    await expect(page.locator("[data-prompt-drop]")).toHaveCount(0);
  });

  test("a docked pop-up can be hidden and brought back docked (#449)", async ({ page }) => {
    await page.addInitScript((key) => localStorage.setItem(key, JSON.stringify({ promptDock: "right" })), SETTINGS);
    await open(page, "confirm");
    await expectDockedIn(page, "right");
    await page.locator(`${PROMPT} .prompt-hide`).click();
    await expect(page.locator(PROMPT)).toBeHidden();
    await expect(page.locator("[data-prompt-dock-host]")).toBeHidden();
    await page.getByRole("button", { name: /^Back to/ }).click();
    await expectDockedIn(page, "right");
  });

  test("Reset layout clears the docked side (#449)", async ({ page }) => {
    await page.addInitScript((key) => localStorage.setItem(key, JSON.stringify({ promptDock: "right" })), SETTINGS);
    await open(page);
    await expectDockedIn(page, "right");
    await page.getByRole("button", { name: "Gameplay settings" }).click();
    await page.getByRole("button", { name: "Reset layout" }).click();
    await page.keyboard.press("Escape");
    await expect.poll(async () => (await stored(page)).promptDock).toBe("");
    await expect(page.locator("[data-prompt-dock-host]")).toHaveCount(0);
  });
});

test("phones ignore a saved dock and keep the floating pop-up (#449)", async ({ page }) => {
  test.skip(desktop(), "phone check");
  await page.addInitScript((key) => localStorage.setItem(key, JSON.stringify({ promptDock: "right" })), SETTINGS);
  await open(page);
  await expect(page.locator("[data-prompt-dock-host]")).toHaveCount(0);
  await expect(page.locator(`${PROMPT} [data-dock]`)).toHaveCount(0);
  await expect(page.locator(".prompt-hide-wrap")).not.toHaveAttribute("data-docked", /.*/);
});
