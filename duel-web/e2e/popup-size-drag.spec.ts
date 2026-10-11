/**
 * Pop-up size and the draggable card action pop-up (#555).
 *
 * The Pop-up size setting (70 to 160%) scales every in-game pop-up: the hover card, choice
 * and search pop-ups, effect order, card actions, DON!! and hand confirms, reveals and the
 * pick bar. The − / + buttons in the hover card and choice pop-up headers step it. The card
 * actions pop-up has a grip that moves it; where it was left is remembered as an offset
 * from its normal spot on the card, for every card.
 *
 * SHOTS=1 also saves screenshots to /mnt/project-files/popup-size-drag/.
 */
import { test, expect } from "./fixtures";
import type { Locator, Page } from "@playwright/test";

test.use({ legacyLayout: false });

const SHOT_DIR = "/mnt/project-files/popup-size-drag";
const POPUP = ".card-preview-popup";
const ACTIONS = ".card-actions";
const GRIP = ".card-actions-grip";
const YOU = (id: string) => `.side-you [data-instance-id="${id}"]`;
const phone = () => test.info().project.name === "phone-375";
const desktopOnly = () => test.skip(test.info().project.name !== "desktop-1280", "desktop window");
const phoneOnly = () => test.skip(!phone(), "phone");

async function openDemo(page: Page, query = "", settings: Record<string, unknown> = {}) {
  await page.addInitScript((s) => {
    // Only the first load: a reload must keep what the page saved itself.
    if (!sessionStorage.getItem("seeded")) {
      localStorage.setItem("optcg-duel:settings", JSON.stringify(s));
      sessionStorage.setItem("seeded", "1");
    }
  }, settings);
  await page.goto(`/demo${query}`);
  await page.locator(".board-root").waitFor();
  await page.waitForTimeout(400);
}

const stored = (page: Page) => page.evaluate(() => JSON.parse(localStorage.getItem("optcg-duel:settings") ?? "{}") as Record<string, unknown>);
const rect = async (loc: Locator) => (await loc.boundingBox())!;

/** A mouse drag on desktop, a CDP touch drag on phones. */
async function drag(page: Page, from: { x: number; y: number }, dx: number, dy: number) {
  if (phone()) {
    const cdp = await page.context().newCDPSession(page);
    await cdp.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [from] });
    for (let i = 1; i <= 8; i += 1) {
      await cdp.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: [{ x: from.x + (dx * i) / 8, y: from.y + (dy * i) / 8 }] });
    }
    await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
    return;
  }
  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  await page.mouse.move(from.x + dx, from.y + dy, { steps: 8 });
  await page.mouse.up();
}

async function dragGrip(page: Page, dx: number, dy: number) {
  const g = await rect(page.locator(GRIP));
  await drag(page, { x: g.x + g.width / 2, y: g.y + g.height / 2 }, dx, dy);
}

async function press(page: Page, target: Locator) {
  if (phone()) await target.tap();
  else await target.click();
}

/** Selecting a card opens its actions pop-up; Escape / an empty tap closes it. */
async function selectCard(page: Page, id: string) {
  await press(page, page.locator(YOU(id)));
  await expect(page.locator(ACTIONS)).toBeVisible();
  await page.waitForTimeout(150);
}

async function deselect(page: Page) {
  await page.keyboard.press("Escape");
  if (await page.locator(ACTIONS).count()) {
    // Phones have no keyboard: tap an empty spot of the board instead.
    await page.mouse.click(8, 300);
  }
  await expect(page.locator(ACTIONS)).toHaveCount(0);
}

/** Whole box in the window, `edge` px from each side (0 = just in the window; the dragged pop-ups keep 8). */
function inside(box: { x: number; y: number; width: number; height: number }, vp: { width: number; height: number }, edge = 0, tol = 1) {
  return box.x >= edge - tol && box.y >= edge - tol && box.x + box.width <= vp.width - edge + tol && box.y + box.height <= vp.height - edge + tol;
}

const ACTION_QUERY = "?cantattack&dons&attackready";

test("+ and − on the hover card pop-up make it wider and narrower, and stop at 160% and 70% (#555)", async ({ page }) => {
  desktopOnly();
  await openDemo(page);
  await page.locator(YOU("y-leader")).hover();
  await expect(page.locator(POPUP)).toBeVisible();
  const before = (await rect(page.locator(POPUP))).width;
  const bigger = page.getByRole("button", { name: "Bigger card preview" });
  const smaller = page.getByRole("button", { name: "Smaller card preview" });
  await bigger.click();
  expect((await rect(page.locator(POPUP))).width).toBeGreaterThan(before + 20);
  expect((await stored(page)).popupSize).toBe(110);
  await smaller.click();
  await smaller.click();
  expect((await rect(page.locator(POPUP))).width).toBeLessThan(before - 20);
  for (let i = 0; i < 9 && (await smaller.isEnabled()); i += 1) await smaller.click();
  await expect(smaller).toBeDisabled();
  expect((await stored(page)).popupSize).toBe(70);
  for (let i = 0; i < 12 && (await bigger.isEnabled()); i += 1) await bigger.click();
  await expect(bigger).toBeDisabled();
  expect((await stored(page)).popupSize).toBe(160);
  // Still fully on screen at 160%, and a dragged spot is pulled back inside after growing.
  expect(inside(await rect(page.locator(POPUP)), page.viewportSize()!, 8)).toBe(true);
});

test("a hover card pop-up dragged to the right edge stays on screen when it is made bigger (#555)", async ({ page }) => {
  desktopOnly();
  await openDemo(page);
  await page.locator(YOU("y-leader")).hover();
  const h = await rect(page.locator(".card-preview-popup-head"));
  await drag(page, { x: h.x + 30, y: h.y + h.height / 2 }, 900, 400);
  const vp = page.viewportSize()!;
  for (let i = 0; i < 6; i += 1) await page.getByRole("button", { name: "Bigger card preview" }).click();
  const box = await rect(page.locator(POPUP));
  expect(box.x + box.width).toBeLessThanOrEqual(vp.width - 8 + 1);
  expect(box.y + box.height).toBeLessThanOrEqual(vp.height - 8 + 1);
});

test("the choice pop-up has its own − / + that step the same setting and the pop-up grows (#555)", async ({ page }) => {
  desktopOnly();
  await openDemo(page, "?box&prompt=look");
  const prompt = page.locator(".ability-prompt").first();
  const before = await rect(prompt);
  await prompt.getByRole("button", { name: "Bigger pop-ups" }).click();
  await prompt.getByRole("button", { name: "Bigger pop-ups" }).click();
  expect((await stored(page)).popupSize).toBe(120);
  const after = await rect(prompt);
  expect(after.width).toBeGreaterThan(before.width * 1.15);
  await prompt.getByRole("button", { name: "Smaller pop-ups" }).click();
  expect((await stored(page)).popupSize).toBe(110);
});

test("the floating card row has − / + too (#555)", async ({ page }) => {
  desktopOnly();
  await openDemo(page, "?prompt=look");
  const card = page.locator(".float-stage .float-card").first();
  await expect(card).toBeVisible();
  await page.waitForTimeout(500);
  const before = await rect(card);
  await page.locator(".float-stage").getByRole("button", { name: "Bigger pop-ups" }).click();
  await page.waitForTimeout(100);
  expect((await stored(page)).popupSize).toBe(110);
  expect((await rect(card)).width).toBeGreaterThan(before.width);
});

/** Give a DON!! to the Leader: the Attach DON!! confirm opens. */
async function openDonConfirm(page: Page) {
  await page.locator('.don-strip-you .don-chip-btn[data-don-id="d1"]').click({ force: true });
  await press(page, page.locator(YOU("y-leader")));
}

/** Play a Counter event from the hand: its "you may" Yes / No opens above the card (desktop; phones counter from the tray). */
async function openHandConfirm(page: Page) {
  await page.locator('.board-root [data-motion-id="y-h6"]').first().click();
  await page.getByRole("button", { name: "Counter event Color of the Supreme King Haki" }).click();
}

type PopupCase = { name: string; query: string; selector: string; setup?: (page: Page) => Promise<void>; desktopOnly?: boolean };
const EVERY_POPUP: PopupCase[] = [
  { name: "choice pop-up", query: "?box&prompt=look", selector: ".ability-prompt" },
  { name: "choice pop-up with cards to pick", query: "?prompt=select", selector: ".ability-prompt, .field-bar" },
  { name: "floating search row", query: "?prompt=look", selector: ".float-stage" },
  { name: "effect order", query: "?prompt=effects&attacked", selector: ".float-stage" },
  { name: "hand confirm", query: "?counter=haki", selector: ".hand-confirm-bubble", setup: openHandConfirm, desktopOnly: true },
  { name: "DON!! attach confirm", query: "?cantattack&dons", selector: ".don-attach-confirm", setup: openDonConfirm },
  { name: "reveal", query: "?reveal=1", selector: ".reveal-card" },
  { name: "card actions", query: ACTION_QUERY, selector: ACTIONS },
];

for (const size of [70, 160]) {
  for (const landscape of [false, true]) {
    for (const p of EVERY_POPUP) {
      test(`${p.name} stays on screen at ${size}%${landscape ? " on a landscape phone" : ""} (#555)`, async ({ page }) => {
        test.skip(p.desktopOnly === true && phone(), "desktop window only");
        test.skip(landscape && !phone(), "landscape phone only");
        if (landscape) await page.setViewportSize({ width: 812, height: 375 });
        await openDemo(page, p.query, { popupSize: size });
        if (p.query === ACTION_QUERY) await selectCard(page, "y-leader");
        await p.setup?.(page);
        const el = page.locator(p.selector).first();
        await expect(el).toBeVisible();
        await page.waitForTimeout(600);
        const vp = page.viewportSize()!;
        expect(inside(await rect(el), vp), `${p.name} ${JSON.stringify(await rect(el))} in ${vp.width}x${vp.height}`).toBe(true);
      });
    }
  }
}

test("dragging the grip moves the action pop-up, and every card's pop-up then opens at that offset (#555)", async ({ page }) => {
  desktopOnly();
  await openDemo(page, ACTION_QUERY);
  await selectCard(page, "y-leader");
  const home = await rect(page.locator(ACTIONS));
  await deselect(page);

  await selectCard(page, "y-c3");
  const c3Home = await rect(page.locator(ACTIONS));
  await dragGrip(page, -140, -70);
  await expect(page.locator(ACTIONS)).toBeVisible();
  const moved = await rect(page.locator(ACTIONS));
  expect(moved.x).toBeCloseTo(c3Home.x - 140, 0);
  expect(moved.y).toBeCloseTo(c3Home.y - 70, 0);
  expect((await stored(page)).actionPopoverOffset).toBe("-140,-70");

  await deselect(page);
  await selectCard(page, "y-leader");
  const again = await rect(page.locator(ACTIONS));
  expect(again.x).toBeCloseTo(home.x - 140, 0);
  expect(again.y).toBeCloseTo(home.y - 70, 0);

  // Double-clicking the grip puts it back for every card.
  await page.locator(GRIP).dblclick();
  const reset = await rect(page.locator(ACTIONS));
  expect(reset.x).toBeCloseTo(home.x, 0);
  expect(reset.y).toBeCloseTo(home.y, 0);
  expect((await stored(page)).actionPopoverOffset).toBe("");
});

test("the action pop-up cannot be dragged off screen, and its buttons do not start a drag (#555)", async ({ page }) => {
  desktopOnly();
  await openDemo(page, ACTION_QUERY);
  await selectCard(page, "y-leader");
  const vp = page.viewportSize()!;
  await dragGrip(page, -3000, -3000);
  const tl = await rect(page.locator(ACTIONS));
  expect(tl.x).toBeCloseTo(8, 0);
  expect(tl.y).toBeCloseTo(8, 0);
  await dragGrip(page, 3000, 3000);
  const br = await rect(page.locator(ACTIONS));
  expect(br.x + br.width).toBeCloseTo(vp.width - 8, 0);
  expect(br.y + br.height).toBeCloseTo(vp.height - 8, 0);
  await page.locator(GRIP).dblclick();
  // Dragging from a button leaves the pop-up where it is.
  const home = await rect(page.locator(ACTIONS));
  const b = await rect(page.locator(ACTIONS).getByRole("button", { name: /Attack/ }));
  await page.mouse.move(b.x + 10, b.y + 10);
  await page.mouse.down();
  await page.mouse.move(b.x - 150, b.y - 90, { steps: 6 });
  await page.mouse.up();
  const after = await rect(page.locator(ACTIONS)).catch(() => null);
  if (after) expect(after.x).toBeCloseTo(home.x, 0);
  expect((await stored(page)).actionPopoverOffset ?? "").toBe("");
});

for (const [name, vp] of [["portrait", null], ["landscape", { width: 812, height: 375 }]] as const) {
  test(`phone ${name}: the action pop-up is on screen, its grip drags it and it reopens moved (#555)`, async ({ page }) => {
    phoneOnly();
    if (vp) await page.setViewportSize(vp);
    await openDemo(page, ACTION_QUERY);
    const size = page.viewportSize()!;
    await selectCard(page, "y-leader");
    const home = await rect(page.locator(ACTIONS));
    expect(inside(home, size, 8)).toBe(true);
    const grip = await rect(page.locator(GRIP));
    expect(grip.width).toBeGreaterThanOrEqual(24);
    expect(grip.height).toBeGreaterThanOrEqual(20);
    await dragGrip(page, -60, -40);
    const moved = await rect(page.locator(ACTIONS));
    expect(inside(moved, size, 8)).toBe(true);
    expect(Math.abs(moved.x - home.x) + Math.abs(moved.y - home.y)).toBeGreaterThan(20);
    await deselect(page);
    await selectCard(page, "y-leader");
    const again = await rect(page.locator(ACTIONS));
    expect(again.x).toBeCloseTo(moved.x, 0);
    expect(again.y).toBeCloseTo(moved.y, 0);
    // Flung off every edge, it still stops fully on screen.
    await dragGrip(page, -3000, -3000);
    expect(inside(await rect(page.locator(ACTIONS)), size, 8)).toBe(true);
    await dragGrip(page, 3000, 3000);
    expect(inside(await rect(page.locator(ACTIONS)), size, 8)).toBe(true);
  });
}

test("SHOTS=1 saves the pop-ups at 70, 100 and 160% (#555)", async ({ page }) => {
  test.skip(!process.env.SHOTS, "set SHOTS=1 to save screenshots");
  test.setTimeout(600_000);
  const viewports = phone()
    ? ([[375, 812], [812, 375]] as const)
    : ([[1280, 720], [1440, 900]] as const);
  for (const [w, h] of viewports) {
    await page.setViewportSize({ width: w, height: h });
    for (const size of [70, 100, 160]) {
      const settings = { popupSize: size };
      const shot = (name: string) => page.screenshot({ path: `${SHOT_DIR}/${name}-${size}-${w}x${h}.png` });
      await page.addInitScript((s) => localStorage.setItem("optcg-duel:settings", JSON.stringify(s)), settings);
      if (!phone()) {
        await page.goto("/demo?faceup=2");
        await page.locator(".board-root").waitFor();
        await page.waitForTimeout(400);
        await page.locator(YOU("y-leader")).hover();
        await page.waitForTimeout(300);
        await shot("card-popup");
      }
      for (const p of EVERY_POPUP.filter((c) => c.name !== "card actions" && !(c.desktopOnly && phone()))) {
        await page.goto(`/demo${p.query}`);
        await page.locator(".board-root").waitFor();
        await page.waitForTimeout(500);
        await p.setup?.(page);
        await page.waitForTimeout(500);
        await shot(p.name.replace(/[^a-z]+/gi, "-").toLowerCase());
      }
      await page.goto(`/demo${ACTION_QUERY}`);
      await page.locator(".board-root").waitFor();
      await page.waitForTimeout(400);
      await selectCard(page, "y-leader");
      await shot("actions");
      await dragGrip(page, -90, -50);
      await page.waitForTimeout(200);
      await shot("actions-moved");
      await page.evaluate(() => localStorage.removeItem("optcg-duel:settings"));
    }
  }
});
