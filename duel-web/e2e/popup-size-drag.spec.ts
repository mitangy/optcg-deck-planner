/**
 * Pop-up size (#555).
 *
 * The Pop-up size setting (70 to 160%) scales every in-game pop-up: the hover card, choice
 * and search pop-ups, effect order, card actions, DON!! and hand confirms, reveals and the
 * pick bar. The − / + buttons in the hover card and choice pop-up headers step it.
 *
 * SHOTS=1 also saves screenshots to /mnt/project-files/popup-size-drag/ (POPUP_SHOT_DIR=<dir> picks another).
 */
import { test, expect } from "./fixtures";
import type { Locator, Page } from "@playwright/test";

test.use({ legacyLayout: false });

const SHOT_DIR = process.env.POPUP_SHOT_DIR ?? "/mnt/project-files/popup-size-drag";
const POPUP = ".card-preview-popup";
const ACTIONS = ".card-actions";
const YOU = (id: string) => `.side-you [data-instance-id="${id}"]`;
const phone = () => test.info().project.name === "phone-375";
const desktopOnly = () => test.skip(test.info().project.name !== "desktop-1280", "desktop window");

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

async function press(page: Page, target: Locator) {
  if (phone()) await target.tap();
  // dispatchEvent: at 160% the hover card that the pointer move opens covers the card being clicked.
  else await target.dispatchEvent("click");
}

/** Selecting a card opens its actions pop-up; Escape / an empty tap closes it. */
async function selectCard(page: Page, id: string) {
  await press(page, page.locator(YOU(id)));
  await expect(page.locator(ACTIONS)).toBeVisible();
  await page.waitForTimeout(150);
}

/** Whole box in the window, `edge` px from each side (0 = just in the window). */
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
  expect((await stored(page)).previewPopupSize).toBe(110);
  await smaller.click();
  await smaller.click();
  expect((await rect(page.locator(POPUP))).width).toBeLessThan(before - 20);
  for (let i = 0; i < 9 && (await smaller.isEnabled()); i += 1) await smaller.click();
  await expect(smaller).toBeDisabled();
  expect((await stored(page)).previewPopupSize).toBe(70);
  for (let i = 0; i < 12 && (await bigger.isEnabled()); i += 1) await bigger.click();
  await expect(bigger).toBeDisabled();
  expect((await stored(page)).previewPopupSize).toBe(160);
  // Still fully on screen at 160%, and a dragged spot is pulled back inside after growing.
  expect(inside(await rect(page.locator(POPUP)), page.viewportSize()!, 8)).toBe(true);
});

test("the hover card's − / + step its own Card pop-up size, not the Pop-up size (#572)", async ({ page }) => {
  desktopOnly();
  await openDemo(page, "", { popupSize: 130 });
  await page.locator(YOU("y-leader")).hover();
  await expect(page.locator(POPUP)).toBeVisible();
  const before = (await rect(page.locator(POPUP))).width;
  await page.getByRole("button", { name: "Bigger card preview" }).click();
  await page.getByRole("button", { name: "Bigger card preview" }).click();
  const saved = await stored(page);
  expect(saved.previewPopupSize).toBe(120);
  expect(saved.popupSize).toBe(130);
  expect((await rect(page.locator(POPUP))).width).toBeGreaterThan(before + 30);
  await page.getByRole("button", { name: "Smaller card preview" }).click();
  expect(await stored(page)).toMatchObject({ previewPopupSize: 110, popupSize: 130 });
});

test("the hover card keeps its normal width at a big Pop-up size (#572)", async ({ page }) => {
  desktopOnly();
  await openDemo(page, "", { popupSize: 160 });
  await page.locator(YOU("y-leader")).hover();
  await expect(page.locator(POPUP)).toBeVisible();
  // 22vw of the 1280px window: the unscaled width.
  expect((await rect(page.locator(POPUP))).width).toBeCloseTo(0.22 * page.viewportSize()!.width, 0);
});

test("a choice pop-up keeps its size at a big Card pop-up size (#572)", async ({ page }) => {
  desktopOnly();
  await openDemo(page, "?box&prompt=look", { previewPopupSize: 160 });
  const prompt = page.locator(".ability-prompt").first();
  await expect(prompt).toBeVisible();
  await page.waitForTimeout(300);
  // 460px: the choice pop-up's width in the wide arena at 100%.
  expect((await rect(prompt)).width).toBeCloseTo(460, 0);
});

/** The hover card's art box at a size, with the box around it. */
async function previewArt(first: Page, size: number, big: boolean, vp: { width: number; height: number }) {
  // A fresh page per size: the seeded settings only load once per page.
  const page = await first.context().newPage();
  await page.setViewportSize(vp);
  await openDemo(page, "", { previewPopupSize: size, previewBigCard: big });
  await page.locator(YOU("y-leader")).hover({ force: true });
  await expect(page.locator(POPUP)).toBeVisible();
  await page.waitForTimeout(300);
  const art = await rect(page.locator(`${POPUP} .card-preview-img, ${POPUP} .card-preview-placeholder`).first());
  const box = await rect(page.locator(POPUP));
  const clipped = await page.locator(POPUP).evaluate((el) => el.scrollWidth > el.clientWidth + 1);
  await page.close();
  return { art, box, clipped };
}

for (const vp of [{ width: 1280, height: 720 }, { width: 1440, height: 900 }]) {
  for (const big of [false, true]) {
    test(`the hover card grows with its pop-up up to the window height, then the pop-up stops (${vp.width}x${vp.height}, big card ${big ? "on" : "off"}) (#572)`, async ({ page }) => {
      desktopOnly();
      const base = await previewArt(page, 100, big, vp);
      let widest = base.art.width;
      for (const size of [130, 160]) {
        const at = await previewArt(page, size, big, vp);
        const note = `${size}%: art ${Math.round(at.art.width)}x${Math.round(at.art.height)} in a ${Math.round(at.box.width)}x${Math.round(at.box.height)} box`;
        // The art box is card-shaped (5:7), so the art itself fills it: no letterbox that only the box grows around.
        expect(at.art.width / at.art.height, note).toBeCloseTo(5 / 7, 2);
        // No empty band: the box is the art plus its padding.
        expect(at.box.width - at.art.width, note).toBeLessThan(30);
        expect(at.art.width, note).toBeGreaterThanOrEqual(widest - 1);
        widest = at.art.width;
        expect(at.clipped, note).toBe(false);
        expect(inside(at.box, vp, 8), note).toBe(true);
      }
      // 130% is still well short of the window height, so it is bigger than 100%.
      expect(widest, "160% art is bigger than at 100%").toBeGreaterThan(base.art.width + 20);
    });
  }
}

/** Open the in-match Gameplay settings sheet (desktop ⚙, phone ⋯ menu). */
async function openSheet(page: Page) {
  const gear = page.getByRole("button", { name: "Gameplay settings" });
  if (await gear.count()) await gear.click();
  else {
    await page.getByRole("button", { name: "Match menu" }).click();
    await page.getByRole("menuitem", { name: /Gameplay settings/ }).click();
  }
  const sheet = page.getByRole("dialog", { name: "Gameplay settings" });
  await expect(sheet).toBeVisible();
  return sheet;
}

test("Gameplay settings have a separate Card pop-up size slider on desktop only, and it leaves the Pop-up size alone (#572)", async ({ page }) => {
  await openDemo(page, "?full");
  const sheet = await openSheet(page);
  const card = sheet.locator("#preview-popup-size");
  const other = sheet.locator("#popup-size");
  await expect(other).toHaveCount(1);
  // The Pop-up size row no longer claims the hover card.
  await expect(other.locator("xpath=..")).not.toContainText("hover card");
  if (phone()) {
    await expect(card).toHaveCount(0);
    return;
  }
  await card.scrollIntoViewIfNeeded();
  await card.focus();
  await page.keyboard.press("ArrowRight");
  await page.keyboard.press("ArrowRight");
  await expect(sheet.getByText("Card pop-up size · 120%")).toBeVisible();
  expect(await stored(page)).toMatchObject({ previewPopupSize: 120 });
  expect((await stored(page)).popupSize ?? 100).toBe(100);
  await expect(sheet.getByText("Pop-up size · 100%")).toBeVisible();
  if (process.env.SHOTS) {
    await sheet.locator("#preview-popup-size").evaluate((el) => el.scrollIntoView({ block: "center" }));
    await page.waitForTimeout(300);
    await page.screenshot({ path: `${SHOT_DIR}/settings-rows-${page.viewportSize()!.width}x${page.viewportSize()!.height}.png` });
  }
});

test("a hover card pop-up dragged to the right edge stays on screen when it is made bigger (#555)", async ({ page }) => {
  desktopOnly();
  await openDemo(page);
  await page.locator(YOU("y-leader")).hover();
  // Pinned: the drag ends past the edge, off the pop-up, and an unpinned hover pop-up would hide 250ms later (#819).
  await page.getByRole("button", { name: "Pin card preview" }).click();
  const h = await rect(page.locator(".card-preview-popup-head"));
  await drag(page, { x: h.x + 30, y: h.y + h.height / 2 }, 900, 400);
  const vp = page.viewportSize()!;
  // After every step, not only the last: a step that does nothing (the size is already at the window-height cap) would hide a late re-fit.
  for (let i = 0; i < 6; i += 1) {
    await page.getByRole("button", { name: "Bigger card preview" }).click();
    const box = await rect(page.locator(POPUP));
    expect(box.x + box.width, `step ${i + 1}`).toBeLessThanOrEqual(vp.width - 8 + 1);
    expect(box.y + box.height, `step ${i + 1}`).toBeLessThanOrEqual(vp.height - 8 + 1);
  }
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
        await page.locator(YOU("y-leader")).hover({ force: true });
        await page.waitForTimeout(300);
        await shot("card-popup");
        // Park the pointer: at 160% the hover card would otherwise cover what the next step touches.
        await page.mouse.move(1, 1);
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
      await page.evaluate(() => localStorage.removeItem("optcg-duel:settings"));
    }
  }
});

test("SHOTS=1 saves the hover card pop-up at 70, 100, 130 and 160% (#572)", async ({ page }) => {
  test.skip(!process.env.SHOTS || phone(), "set SHOTS=1 to save screenshots (desktop)");
  test.setTimeout(600_000);
  for (const [w, h] of [[1280, 720], [1440, 900]] as const) {
    for (const big of [false, true]) {
      for (const size of [70, 100, 130, 160]) {
        const fresh = await page.context().newPage();
        await fresh.setViewportSize({ width: w, height: h });
        await openDemo(fresh, "?faceup=2", { previewPopupSize: size, previewBigCard: big });
        await fresh.locator(YOU("y-leader")).hover({ force: true });
        await expect(fresh.locator(POPUP)).toBeVisible();
        await fresh.waitForTimeout(400);
        await fresh.screenshot({ path: `${SHOT_DIR}/hover-card-${w}x${h}-${big ? "big" : "small"}-${size}.png` });
        await fresh.close();
      }
    }
  }
});
