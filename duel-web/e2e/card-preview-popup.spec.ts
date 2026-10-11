/**
 * The card preview as a draggable pop-up (#529): hovering a card opens a large
 * floating box that shows while you hover a card (or pin it open), that you can
 * drag anywhere and put back with a double-click; hovering a face-up Life card shows it directly; and Bigger
 * playing area's side columns can be dragged to their own widths.
 *
 * SHOTS=1 also saves screenshots to /mnt/project-files/card-preview-popup/.
 */
import { test, expect } from "./fixtures";
import type { Page } from "@playwright/test";

// This spec is about the new defaults (pop-up on, one column), so it skips the legacy two-column seeding.
test.use({ legacyLayout: false });

const POPUP = ".card-preview-popup";
const HEAD = ".card-preview-popup-head";
const SHOT_DIR = "/mnt/project-files/card-preview-popup";

const desktopOnly = () => test.skip(test.info().project.name !== "desktop-1280", "the pop-up is the desktop window");

async function openDemo(page: Page, settings: Record<string, unknown> = {}, query = "") {
  if (Object.keys(settings).length) {
    await page.addInitScript((s) => {
      // Only the first load: a reload must keep what the page saved itself.
      if (!sessionStorage.getItem("seeded")) {
        localStorage.setItem("optcg-duel:settings", JSON.stringify(s));
        sessionStorage.setItem("seeded", "1");
      }
    }, settings);
  }
  await page.goto(`/demo${query}`);
  await page.locator(".board-root").waitFor();
  await page.waitForTimeout(300);
}

const hoverLeader = (page: Page) => page.locator('.side-you [data-instance-id="y-leader"]').hover();

async function dragHead(page: Page, dx: number, dy: number) {
  const h = (await page.locator(HEAD).boundingBox())!;
  const x = h.x + 30;
  const y = h.y + h.height / 2;
  await page.mouse.move(x, y);
  await page.mouse.down();
  await page.mouse.move(x + dx, y + dy, { steps: 8 });
  await page.mouse.up();
}

test("hovering a card opens a large pop-up, and the side column no longer holds the preview (#529)", async ({ page }) => {
  desktopOnly();
  await openDemo(page);
  await hoverLeader(page);
  const popup = page.locator(POPUP);
  await expect(popup).toBeVisible();
  const box = (await popup.boundingBox())!;
  expect(box.width).toBeGreaterThanOrEqual(279);
  expect(box.height).toBeGreaterThan(300);
  await expect(page.locator(`${POPUP} .card-preview-popup-title`)).not.toBeEmpty();
  await expect(page.locator('[data-panel="preview"]')).toHaveCount(0);
  // Up in the top right of the board, inside the window and not over the right column.
  const rail = (await page.locator(".arena-rail").boundingBox())!;
  expect(box.x + box.width).toBeLessThanOrEqual(rail.x);
  expect(box.y).toBeGreaterThanOrEqual(8);
});

test("the pop-up drags by its header, stays on screen, and is where it was left after a reload (#529)", async ({ page }) => {
  desktopOnly();
  await openDemo(page);
  await hoverLeader(page);
  const before = (await page.locator(POPUP).boundingBox())!;
  await dragHead(page, -300, -50);
  const after = (await page.locator(POPUP).boundingBox())!;
  expect(after.x).toBeCloseTo(before.x - 300, 0);
  expect(after.y).toBeCloseTo(before.y - 50, 0);

  // Dragged off every edge, it stops 8px short of each.
  await dragHead(page, -3000, -3000);
  const corner = (await page.locator(POPUP).boundingBox())!;
  expect(corner.x).toBeCloseTo(8, 0);
  expect(corner.y).toBeCloseTo(8, 0);
  await dragHead(page, 3000, 3000);
  const far = (await page.locator(POPUP).boundingBox())!;
  const vp = page.viewportSize()!;
  expect(far.x + far.width).toBeCloseTo(vp.width - 8, 0);
  expect(far.y + far.height).toBeCloseTo(vp.height - 8, 0);

  await dragHead(page, -400, -100);
  const placed = (await page.locator(POPUP).boundingBox())!;
  await page.reload();
  await page.locator(".board-root").waitFor();
  await hoverLeader(page);
  const reloaded = (await page.locator(POPUP).boundingBox())!;
  expect(reloaded.x).toBeCloseTo(placed.x, 0);
  expect(reloaded.y).toBeCloseTo(placed.y, 0);
});

test("double-clicking the header puts the pop-up back (#529)", async ({ page }) => {
  desktopOnly();
  await openDemo(page);
  await hoverLeader(page);
  const home = (await page.locator(POPUP).boundingBox())!;
  await dragHead(page, -300, -50);
  await page.locator(HEAD).dblclick({ position: { x: 30, y: 10 } });
  const back = (await page.locator(POPUP).boundingBox())!;
  expect(back.x).toBeCloseTo(home.x, 0);
  expect(back.y).toBeCloseTo(home.y, 0);
});

const EMPTY_BOARD = { x: 300, y: 20 };
const pin = (page: Page) => page.getByRole("button", { name: "Pin card preview" });

test("a demo that opens with an opponent's play showing has no pop-up until a card is hovered (#529)", async ({ page }) => {
  desktopOnly();
  await openDemo(page);
  // The opponent's latest play is previewed automatically (the docked panel would show it); the pop-up does not open for it.
  await page.waitForTimeout(600);
  await expect(page.locator(POPUP)).toHaveCount(0);
  await hoverLeader(page);
  await expect(page.locator(POPUP)).toBeVisible();
});

test("the pop-up hides shortly after the pointer leaves the card (#529)", async ({ page }) => {
  desktopOnly();
  await openDemo(page);
  await hoverLeader(page);
  await expect(page.locator(POPUP)).toBeVisible();
  await page.mouse.move(EMPTY_BOARD.x, EMPTY_BOARD.y, { steps: 4 });
  await expect(page.locator(POPUP)).toHaveCount(0);
  // The same card hovered again reopens it.
  await hoverLeader(page);
  await expect(page.locator(POPUP)).toBeVisible();
});

test("moving from the card onto the pop-up keeps it open until the pointer leaves it (#529)", async ({ page }) => {
  desktopOnly();
  await openDemo(page);
  await hoverLeader(page);
  const h = (await page.locator(HEAD).boundingBox())!;
  await page.mouse.move(h.x + h.width / 2, h.y + h.height / 2, { steps: 3 });
  await page.waitForTimeout(700);
  await expect(page.locator(POPUP)).toBeVisible();
  await page.mouse.move(EMPTY_BOARD.x, EMPTY_BOARD.y, { steps: 6 });
  await expect(page.locator(POPUP)).toHaveCount(0);
});

test("a pinned pop-up stays open when the pointer leaves, and unpinning or the x closes it (#529)", async ({ page }) => {
  desktopOnly();
  await openDemo(page);
  await hoverLeader(page);
  await expect(page.locator(`${POPUP} .card-preview-popup-close`)).toHaveCount(0);
  await pin(page).click();
  await expect(page.getByRole("button", { name: "Unpin card preview" })).toHaveAttribute("aria-pressed", "true");
  await page.mouse.move(EMPTY_BOARD.x, EMPTY_BOARD.y, { steps: 6 });
  await page.waitForTimeout(700);
  await expect(page.locator(POPUP)).toBeVisible();
  // Still there after a reload (a device setting), showing the card once there is one.
  await page.reload();
  await page.locator(".board-root").waitFor();
  await hoverLeader(page);
  await page.mouse.move(EMPTY_BOARD.x, EMPTY_BOARD.y, { steps: 6 });
  await page.waitForTimeout(700);
  await expect(page.locator(POPUP)).toBeVisible();
  // The x unpins and hides it; the next hover shows the plain hover pop-up again.
  await page.getByRole("button", { name: "Close card preview" }).click();
  await expect(page.locator(POPUP)).toHaveCount(0);
  await hoverLeader(page);
  await expect(page.locator(POPUP)).toBeVisible();
  await expect(pin(page)).toHaveAttribute("aria-pressed", "false");
  await page.mouse.move(EMPTY_BOARD.x, EMPTY_BOARD.y, { steps: 4 });
  await expect(page.locator(POPUP)).toHaveCount(0);
});

test("turning the pop-up off puts the preview back in its side column (#529)", async ({ page }) => {
  desktopOnly();
  await openDemo(page, { previewPopup: false });
  await expect(page.locator('[data-panel="preview"]')).toBeVisible();
  await hoverLeader(page);
  await expect(page.locator(POPUP)).toHaveCount(0);
  await expect(page.locator('[data-panel="preview"] .card-preview-name')).toBeVisible();
});

test("hovering a face-up Life card shows it in the pop-up without opening the Life list (#529)", async ({ page }) => {
  desktopOnly();
  await openDemo(page, {}, "?faceup=1");
  await hoverLeader(page);
  const title = page.locator(`${POPUP} .card-preview-popup-title`);
  const leaderName = await title.textContent();
  await page.mouse.move(5, 400);
  await page.locator(".side-you .zone-pile-life .zone-pile-face.is-face-up").hover();
  await expect(title).not.toHaveText(leaderName!);
  await expect(page.getByRole("dialog", { name: /face-up Life/i })).toHaveCount(0);
  // The pile still opens its list on click.
  await page.locator(".side-you .zone-pile-life .zone-pile-face.is-face-up").click();
  await expect(page.getByText("Your face-up Life")).toBeVisible();
});

test("phones show no pop-up (#529)", async ({ page }) => {
  test.skip(test.info().project.name !== "phone-375", "phone check");
  await openDemo(page);
  // A mouse over a card is what sets the preview (a finger does not), so use one.
  await page.locator('.side-you [data-instance-id="y-leader"]').hover();
  await expect(page.locator(".card-preview-name, .card-preview-img").first()).toHaveCount(0);
  await expect(page.locator(POPUP)).toHaveCount(0);
});

test("a column dragged in Bigger playing area keeps its own width, apart from the normal layout's (#529)", async ({ page }) => {
  desktopOnly();
  const rail = async () => Math.round((await page.locator(".arena-rail").boundingBox())!.width);
  await openDemo(page, { bigBoard: true });
  const narrow = await rail();
  const handle = (await page.locator(".col-resize-right").boundingBox())!;
  await page.mouse.move(handle.x + handle.width / 2, handle.y + 200);
  await page.mouse.down();
  await page.mouse.move(handle.x + handle.width / 2 - 70, handle.y + 200, { steps: 6 });
  await page.mouse.up();
  const wider = await rail();
  expect(wider).toBeGreaterThan(narrow + 40);

  await page.reload();
  await page.locator(".board-root").waitFor();
  await page.waitForTimeout(300);
  expect(await rail()).toBe(wider);

  // Normal layout is untouched by what was dragged in the big one.
  const saved = await page.evaluate(() => JSON.parse(localStorage.getItem("optcg-duel:settings")!));
  expect(saved.panelSizesBig).toMatch(/R=\d+/);
  expect(saved.panelSizes ?? "").toBe("");
});

test("SHOTS=1 saves the pop-up at desktop and phone sizes (#529)", async ({ page }) => {
  test.skip(!process.env.SHOTS, "set SHOTS=1 to save screenshots");
  desktopOnly();
  for (const [w, h] of [
    [1280, 720],
    [1440, 900],
    [375, 812],
    [812, 375],
  ] as const) {
    await page.setViewportSize({ width: w, height: h });
    await page.goto("/demo?faceup=2");
    await page.locator(".board-root").waitFor();
    await page.waitForTimeout(500);
    const wide = w >= 1000;
    if (wide) await hoverLeader(page);
    else await page.locator('.side-you [data-instance-id="y-leader"]').tap().catch(() => undefined);
    await page.waitForTimeout(300);
    expect(await page.locator(POPUP).count(), `${w}x${h} pop-up`).toBe(wide ? 1 : 0);
    await page.screenshot({ path: `${SHOT_DIR}/popup-${w}x${h}.png` });
    if (wide) {
      await pin(page).click();
      await page.mouse.move(EMPTY_BOARD.x, EMPTY_BOARD.y, { steps: 4 });
      await page.waitForTimeout(400);
      await page.screenshot({ path: `${SHOT_DIR}/popup-pinned-${w}x${h}.png` });
      await page.getByRole("button", { name: "Close card preview" }).click();
    }
  }
});

test("SHOTS=1 saves one column on the right, one on the left and both (#529)", async ({ page }) => {
  test.skip(!process.env.SHOTS, "set SHOTS=1 to save screenshots");
  desktopOnly();
  for (const [w, h] of [
    [1280, 720],
    [1440, 900],
  ] as const) {
    for (const side of ["right", "left", "both"] as const) {
      await page.setViewportSize({ width: w, height: h });
      await page.addInitScript((s) => localStorage.setItem("optcg-duel:settings", JSON.stringify(s)), { sideColumns: side });
      await page.goto("/demo");
      await page.locator(".board-root").waitFor();
      await page.waitForTimeout(500);
      await hoverLeader(page);
      await page.screenshot({ path: `${SHOT_DIR}/columns-${side}-${w}x${h}.png` });
    }
  }
});
