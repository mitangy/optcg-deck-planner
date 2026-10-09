/**
 * The Log Pose panel's corners, its pop out of the compass and docking it to a side (#432). The two Log Pose
 * services are faked in the browser (the planner API's chat session and the analyst's brief stream); the panel,
 * the compass, the page and the practice board are the real ones.
 *
 * LP_DOCK_SHOTS=<dir> also saves screenshots of each state there.
 */
import { test, expect, type Page } from "./fixtures";
import { FAKE_API } from "./fixtures";

const ANALYST = "http://127.0.0.1:8766";
const PAGE_ORIGIN = process.env.E2E_PAGE_ORIGIN ?? "http://127.0.0.1:5174";
const CORS = {
  "access-control-allow-origin": PAGE_ORIGIN,
  "access-control-allow-credentials": "true",
  "access-control-allow-headers": "authorization, content-type",
  "access-control-allow-methods": "POST, OPTIONS",
};
const SHOTS = process.env.LP_DOCK_SHOTS;
const shot = async (page: Page, name: string) => {
  if (SHOTS) await page.screenshot({ path: `${SHOTS}/${name}.png` });
};

async function fakeLogPose(page: Page) {
  await page.route(`${FAKE_API}/analyst/chat/session`, (route) =>
    route.fulfill({
      status: 200,
      headers: CORS,
      json: { enabled: true, token: "chat.1.9999999999.x", expires_at: new Date(Date.now() + 3600_000).toISOString(), chat_url: ANALYST },
    }),
  );
  await page.route(`${FAKE_API}/analyst/chat/threads/*`, (route) => route.fulfill({ status: 404, headers: CORS, json: {} }));
  await page.route(`${ANALYST}/**`, (route) => {
    if (route.request().method() === "OPTIONS") return route.fulfill({ status: 204, headers: CORS });
    return route.fulfill({ status: 200, headers: { ...CORS, "content-type": "text/event-stream" }, body: `event: done\ndata: ${JSON.stringify({ cached: false })}\n\n` });
  });
}

/** A fresh browser profile on the first load only, so a reload keeps what the page remembered. */
async function freshProfile(page: Page) {
  await page.addInitScript(() => {
    if (sessionStorage.getItem("e2e-fresh")) return;
    sessionStorage.setItem("e2e-fresh", "1");
    localStorage.clear();
  });
}

const panel = (page: Page) => page.getByRole("dialog", { name: /Log Pose/ });
const compass = (page: Page) => page.locator(".lp-compass");

async function openFromCompass(page: Page) {
  await compass(page).click();
  await expect(panel(page)).toBeVisible();
  // The grow has played out.
  await expect.poll(() => panel(page).evaluate((el) => el.getAnimations().length)).toBe(0);
}

/** Drags the panel's header from its title to (x, y), holding the button down at the end when `release` is false. */
async function dragHeader(page: Page, to: { x: number; y: number }, release = true) {
  const title = (await panel(page).locator("#lp-title").boundingBox())!;
  const from = { x: title.x + Math.min(title.width, 40) / 2, y: title.y + title.height / 2 };
  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  await page.mouse.move((from.x + to.x) / 2, (from.y + to.y) / 2, { steps: 6 });
  await page.mouse.move(to.x, to.y, { steps: 6 });
  if (release) await page.mouse.up();
}

const room = (page: Page) => page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);

// `duel` is asked for here so its catch-all fake API is set up before the Log Pose routes (the later route wins).
test.beforeEach(async ({ page, duel }, info) => {
  void duel;
  test.skip(info.project.name !== "desktop-1280", "the desktop project drives these; the phone and landscape runs set their own viewport");
  await fakeLogPose(page);
});

test("a window that was moved has a border and rounded corners on all four sides (#432)", async ({ page }) => {
  await freshProfile(page);
  await page.goto("/decks");
  await openFromCompass(page);
  // The default drawer is flush to the right edge: square.
  expect(await panel(page).evaluate((el) => getComputedStyle(el).borderTopLeftRadius)).toBe("0px");

  await dragHeader(page, { x: 500, y: 320 });
  await expect(panel(page)).toHaveAttribute("data-sized", "true");
  const corners = await panel(page).evaluate((el) => {
    const s = getComputedStyle(el);
    return {
      radius: [s.borderTopLeftRadius, s.borderTopRightRadius, s.borderBottomRightRadius, s.borderBottomLeftRadius].map(parseFloat),
      border: [s.borderTopWidth, s.borderRightWidth, s.borderBottomWidth, s.borderLeftWidth].map(parseFloat),
    };
  });
  for (const r of corners.radius) expect(r).toBeGreaterThan(0);
  for (const b of corners.border) expect(b).toBeGreaterThan(0);
  await shot(page, "01-moved-window-rounded-corners");
});

test("pressing a header button and moving the pointer does not drag the window (#432)", async ({ page }) => {
  await freshProfile(page);
  await page.goto("/decks");
  await openFromCompass(page);
  await dragHeader(page, { x: 640, y: 360 });
  await expect(panel(page)).toHaveAttribute("data-sized", "true");
  const before = (await panel(page).boundingBox())!;
  const button = (await panel(page).getByRole("button", { name: "New chat" }).boundingBox())!;
  await page.mouse.move(button.x + button.width / 2, button.y + button.height / 2);
  await page.mouse.down();
  await page.mouse.move(button.x + 150, button.y + 120, { steps: 6 });
  await page.mouse.up();
  const after = (await panel(page).boundingBox())!;
  expect([after.x, after.y]).toEqual([before.x, before.y]);
});

test("the panel grows out of the compass, and closing shrinks it back before the compass returns (#432)", async ({ page }) => {
  await freshProfile(page);
  await page.goto("/decks");
  await expect(compass(page)).toBeVisible();

  // Opening: the click leaves the panel growing from the compass's centre (1238, 678), measured from the panel's corner.
  const opening = await page.evaluate(async () => {
    (document.querySelector(".lp-compass") as HTMLElement).click();
    await new Promise<void>((r) => queueMicrotask(() => queueMicrotask(r)));
    const el = document.querySelector<HTMLElement>(".lp-panel");
    return el ? { playing: el.getAnimations().length, origin: el.style.transformOrigin, left: el.offsetLeft, compass: !!document.querySelector(".lp-compass") } : null;
  });
  expect(opening).not.toBeNull();
  expect(opening!.playing).toBe(1);
  expect(opening!.compass).toBe(false);
  const [ox, oy] = opening!.origin.split(" ").map(parseFloat);
  expect(opening!.left + ox!).toBeCloseTo(1238, 0);
  expect(oy).toBeCloseTo(678, 0);
  await expect.poll(() => panel(page).evaluate((el) => el.getAnimations().length)).toBe(0);
  await expect(panel(page).locator(".lp-head")).toBeVisible();
  await shot(page, "02-open");

  // Closing: still on screen, no longer taking clicks, and the compass has not come back yet.
  const closing = await page.evaluate(async () => {
    (document.querySelector('.lp-panel button[aria-label="Close Log Pose"]') as HTMLElement).click();
    await new Promise<void>((r) => queueMicrotask(() => queueMicrotask(r)));
    const el = document.querySelector<HTMLElement>(".lp-panel");
    return { mounted: !!el, closing: el?.dataset.closing, playing: el?.getAnimations().length, compass: !!document.querySelector(".lp-compass") };
  });
  expect(closing).toEqual({ mounted: true, closing: "true", playing: 1, compass: false });
  await expect(panel(page)).toHaveCount(0);
  await expect(compass(page)).toBeVisible();

  // Esc closes the same way.
  await compass(page).click();
  await expect(panel(page)).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(panel(page)).toHaveCount(0);
  await expect(compass(page)).toBeVisible();
});

test("halfway through opening the panel is smaller than the open panel and still see-through (#432)", async ({ page }) => {
  await freshProfile(page);
  await page.goto("/decks");
  await expect(compass(page)).toBeVisible();
  const frame = await page.evaluate(async () => {
    (document.querySelector(".lp-compass") as HTMLElement).click();
    await new Promise<void>((r) => queueMicrotask(() => queueMicrotask(r)));
    const el = document.querySelector<HTMLElement>(".lp-panel")!;
    const a = el.getAnimations()[0]!;
    a.pause();
    a.currentTime = 100;
    return { shown: el.getBoundingClientRect().width, full: el.offsetWidth, opacity: Number(getComputedStyle(el).opacity) };
  });
  expect(frame.shown).toBeGreaterThan(frame.full * 0.1);
  expect(frame.shown).toBeLessThan(frame.full * 0.9);
  expect(frame.opacity).toBeGreaterThan(0);
  expect(frame.opacity).toBeLessThan(1);
  await shot(page, "03-mid-open-animation");
});

test("opens and closes at once under reduced motion (#432)", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await freshProfile(page);
  await page.goto("/decks");
  await expect(compass(page)).toBeVisible();
  const opened = await page.evaluate(async () => {
    (document.querySelector(".lp-compass") as HTMLElement).click();
    await new Promise<void>((r) => queueMicrotask(() => queueMicrotask(r)));
    return document.querySelector<HTMLElement>(".lp-panel")?.getAnimations().length;
  });
  expect(opened).toBe(0);
  const closed = await page.evaluate(async () => {
    (document.querySelector('.lp-panel button[aria-label="Close Log Pose"]') as HTMLElement).click();
    await new Promise<void>((r) => queueMicrotask(() => queueMicrotask(r)));
    return { mounted: !!document.querySelector(".lp-panel"), compass: !!document.querySelector(".lp-compass") };
  });
  expect(closed).toEqual({ mounted: false, compass: true });
});

test("dragging the header to the right edge docks a full-height panel, the page makes room, and dragging it away undocks (#432)", async ({ page }) => {
  await freshProfile(page);
  await page.goto("/decks");
  await openFromCompass(page);
  const head = panel(page).locator(".lp-head");

  // Mid-drag: a preview of the strip it would take, and the panel has not docked yet.
  await dragHeader(page, { x: 1276, y: 300 }, false);
  const preview = page.locator(".lp-dock-preview");
  await expect(preview).toBeVisible();
  const strip = (await preview.boundingBox())!;
  expect(strip.x + strip.width).toBeCloseTo(1280, 0);
  expect(strip.height).toBeCloseTo(720, 0);
  await expect(panel(page)).not.toHaveAttribute("data-dock", /.+/);
  await page.mouse.up();

  await expect(panel(page)).toHaveAttribute("data-dock", "right");
  await expect(preview).toHaveCount(0);
  const box = (await panel(page).boundingBox())!;
  expect(box.x + box.width).toBeCloseTo(1280, 0);
  expect(box.y).toBeCloseTo(0, 0);
  expect(box.height).toBeCloseTo(720, 0);
  expect(box.width).toBeCloseTo(380, 0);
  // The page keeps out from under it, and nothing scrolls sideways.
  expect(await page.evaluate(() => document.documentElement.dataset.lpDock)).toBe("right");
  expect(await page.evaluate(() => parseFloat(getComputedStyle(document.body).paddingRight))).toBeCloseTo(box.width, 0);
  // Content that sat on the right (the New deck button) moved left of the strip instead of hiding under it.
  const newDeck = (await page.getByRole("button", { name: "New deck" }).boundingBox())!;
  expect(newDeck.x + newDeck.width).toBeLessThanOrEqual(box.x);
  expect(await room(page)).toBeLessThanOrEqual(0);
  expect(await page.evaluate(() => localStorage.getItem("optcg-logpose:dock"))).toBe("right");
  await shot(page, "04-docked-right-outside-a-game");

  // It stays docked after a reload, and closing gives the room back.
  await page.reload();
  await compass(page).click();
  await expect(panel(page)).toHaveAttribute("data-dock", "right");
  await page.getByRole("button", { name: "Close Log Pose" }).click();
  await expect(panel(page)).toHaveCount(0);
  expect(await page.evaluate(() => document.documentElement.dataset.lpDock)).toBeUndefined();
  expect(await page.evaluate(() => parseFloat(getComputedStyle(document.body).paddingRight))).toBe(0);
  await compass(page).click();
  await expect(panel(page)).toHaveAttribute("data-dock", "right");

  // Dragging a docked header less than ~32px keeps it docked; pulling it further lets go under the pointer.
  const h = (await head.boundingBox())!;
  await page.mouse.move(h.x + 70, h.y + 20);
  await page.mouse.down();
  await page.mouse.move(h.x + 60, h.y + 25, { steps: 3 });
  await page.mouse.up();
  await expect(panel(page)).toHaveAttribute("data-dock", "right");
  await dragHeader(page, { x: 500, y: 300 });
  await expect(panel(page)).not.toHaveAttribute("data-dock", /.+/);
  await expect(panel(page)).toHaveAttribute("data-sized", "true");
  expect(await page.evaluate(() => document.documentElement.dataset.lpDock)).toBeUndefined();
  expect(await page.evaluate(() => parseFloat(getComputedStyle(document.body).paddingRight))).toBe(0);
  expect(await page.evaluate(() => localStorage.getItem("optcg-logpose:dock"))).toBeNull();
  const loose = (await panel(page).boundingBox())!;
  expect(loose.x).toBeLessThan(500);
  expect(loose.x + loose.width).toBeGreaterThan(500);
});

test("dragging the header to the left edge docks to the left (#432)", async ({ page }) => {
  await freshProfile(page);
  await page.goto("/decks");
  await openFromCompass(page);
  await dragHeader(page, { x: 4, y: 300 });
  await expect(panel(page)).toHaveAttribute("data-dock", "left");
  const box = (await panel(page).boundingBox())!;
  expect(box.x).toBeCloseTo(0, 0);
  expect(box.height).toBeCloseTo(720, 0);
  expect(await page.evaluate(() => parseFloat(getComputedStyle(document.body).paddingLeft))).toBeCloseTo(box.width, 0);
  expect(await page.evaluate(() => parseFloat(getComputedStyle(document.body).paddingRight))).toBe(0);
  expect(await room(page)).toBeLessThanOrEqual(0);
  await shot(page, "05-docked-left-outside-a-game");

  // Its inner edge sets the width, which is remembered.
  const handle = page.locator(".lp-resize-dock");
  const edge = (await handle.boundingBox())!;
  await page.mouse.move(edge.x + edge.width / 2, 300);
  await page.mouse.down();
  await page.mouse.move(edge.x + edge.width / 2 + 60, 300, { steps: 5 });
  await page.mouse.up();
  const wider = (await panel(page).boundingBox())!;
  expect(wider.width).toBeCloseTo(box.width + 60, 0);
  expect(await page.evaluate(() => parseFloat(getComputedStyle(document.body).paddingLeft))).toBeCloseTo(wider.width, 0);
  expect(await page.evaluate(() => localStorage.getItem("optcg-logpose:dock-w"))).toBe(String(Math.round(wider.width)));
});

test("the move grip docks with an arrow key toward the edge and undocks with one away; double-click on a docked header resets (#432)", async ({ page }) => {
  await freshProfile(page);
  await page.goto("/decks");
  await openFromCompass(page);
  const grip = panel(page).getByRole("button", { name: "Move Log Pose" });

  // The default drawer touches the right edge, so Right docks there; Left lets it go.
  await grip.focus();
  await page.keyboard.press("ArrowLeft");
  await expect(panel(page)).not.toHaveAttribute("data-dock", /.+/);
  await expect(panel(page)).toHaveAttribute("data-sized", "true");
  await page.keyboard.press("ArrowRight");
  await page.keyboard.press("ArrowRight");
  await expect(panel(page)).toHaveAttribute("data-dock", "right");
  await grip.focus();
  await page.keyboard.press("ArrowRight");
  await expect(panel(page)).toHaveAttribute("data-dock", "right");
  await page.keyboard.press("ArrowLeft");
  await expect(panel(page)).not.toHaveAttribute("data-dock", /.+/);
  expect(await page.evaluate(() => document.documentElement.dataset.lpDock)).toBeUndefined();

  // Dock again, then double-click the header: back to the default corner.
  await grip.focus();
  await page.keyboard.press("ArrowRight");
  await page.keyboard.press("ArrowRight");
  await expect(panel(page)).toHaveAttribute("data-dock", "right");
  await panel(page).locator(".lp-head").dblclick({ position: { x: 70, y: 20 } });
  await expect(panel(page)).not.toHaveAttribute("data-dock", /.+/);
  await expect(panel(page)).not.toHaveAttribute("data-sized", /.+/);
  const box = (await panel(page).boundingBox())!;
  expect(box.x + box.width).toBeCloseTo(1280, 0);
  expect(box.height).toBeCloseTo(720, 0);
});

/** The practice board, with Log Pose's panel opened by itself for the mulligan (a wide screen). */
async function practiceBoard(page: Page, duel: { startPractice: (o: { seed: number }) => Promise<void> }) {
  await duel.startPractice({ seed: 11 });
  await expect(panel(page)).toBeVisible();
  await expect.poll(() => panel(page).evaluate((el) => el.getAnimations().length)).toBe(0);
}

test("on a board, docking puts the panel in that side's column in place of an empty slot, and closing gives the slot back (#432)", async ({ page, duel }) => {
  await practiceBoard(page, duel);
  const right = page.locator('[data-panel-col="right"]');
  const left = page.locator('[data-panel-col="left"]');
  await expect(page.locator(".lp-dock-host")).toHaveCount(0);

  await dragHeader(page, { x: 1276, y: 300 }, false);
  const preview = (await page.locator(".lp-dock-preview").boundingBox())!;
  const col = (await right.boundingBox())!;
  expect(preview.x).toBeCloseTo(col.x, 0);
  expect(preview.width).toBeCloseTo(col.width, 0);
  await page.mouse.up();

  await expect(right.locator(".lp-dock-host .lp-panel")).toBeVisible();
  await expect(left.locator(".lp-dock-host")).toHaveCount(0);
  const host = (await right.locator(".lp-dock-host").boundingBox())!;
  expect(host.height).toBeGreaterThanOrEqual(340);
  const inner = (await right.locator(".lp-dock-host .lp-panel").boundingBox())!;
  expect(inner.x).toBeGreaterThanOrEqual(host.x - 1);
  expect(inner.x + inner.width).toBeLessThanOrEqual(host.x + host.width + 1);
  expect(inner.y + inner.height).toBeLessThanOrEqual(host.y + host.height + 1);
  // It is a panel of the column: the rest of the column is still there, below it and not overlapping.
  const col2 = (await right.boundingBox())!;
  expect(host.y).toBeGreaterThanOrEqual(col2.y - 1);
  expect(host.y + host.height).toBeLessThanOrEqual(col2.y + col2.height + 1);
  const others = await right.locator(":scope > .board-panel:not(.lp-dock-host)").evaluateAll((els) => els.map((e) => ({ top: e.getBoundingClientRect().top, bottom: e.getBoundingClientRect().bottom })));
  expect(others.length).toBeGreaterThan(0);
  for (const o of others) expect(o.top).toBeGreaterThanOrEqual(host.y + host.height - 1);
  // The opponent's hand fan hangs from the panel under the host: its cards are all below the host, none peeking behind it.
  const fan = await right.locator(".opp-hand-fan .opp-fan-card").evaluateAll((els) => els.map((e) => e.getBoundingClientRect().top));
  expect(fan.length).toBeGreaterThan(0);
  for (const top of fan) expect(top).toBeGreaterThanOrEqual(host.y + host.height - 1);
  await expect(page.getByRole("button", { name: "Keep opening hand" })).toBeVisible();
  expect(await room(page)).toBeLessThanOrEqual(0);
  await shot(page, "06-docked-into-game-right-column");

  // Dragged over the left column it moves there.
  await dragHeader(page, { x: 200, y: 400 });
  await expect(left.locator(".lp-dock-host .lp-panel")).toBeVisible();
  await expect(right.locator(".lp-dock-host")).toHaveCount(0);
  // The left column is narrower than the panel's minimum by default: it widens while the panel is docked in it.
  expect((await left.boundingBox())!.width).toBeGreaterThanOrEqual(320);
  const leftHost = (await left.locator(".lp-dock-host").boundingBox())!;
  const below = await left.locator(":scope > .board-panel:not(.lp-dock-host)").evaluateAll((els) => els.map((e) => e.getBoundingClientRect().top));
  for (const top of below) expect(top).toBeGreaterThanOrEqual(leftHost.y + leftHost.height - 1);
  await expect(panel(page).locator(".lp-head")).toBeVisible();
  const headRows = await panel(page).locator(".lp-head").evaluate((h) => new Set([...h.children].filter((c) => c.getBoundingClientRect().width > 0).map((c) => Math.round((c.getBoundingClientRect().top + c.getBoundingClientRect().height / 2) / 8))).size);
  expect(headRows).toBe(1);
  await shot(page, "07-docked-into-game-left-column");

  // Closing leaves no empty slot; the Brief button opens it again where it was docked.
  await page.getByRole("button", { name: "Close Log Pose" }).click();
  await expect(panel(page)).toHaveCount(0);
  await expect(page.locator(".lp-dock-host")).toHaveCount(0);
  expect((await left.boundingBox())!.width).toBeLessThan(320);
  await page.getByRole("button", { name: "Matchup brief", exact: true }).click();
  await expect(left.locator(".lp-dock-host .lp-panel")).toBeVisible();
  // The matchup brief stays pinned at the top of the chat.
  await expect(left.locator(".lp-dock-host .lp-pinned .match-brief-pinned")).toBeVisible();

  // Pulled out by the header it floats again.
  await dragHeader(page, { x: 700, y: 300 });
  await expect(panel(page)).toHaveAttribute("data-sized", "true");
  await expect(page.locator(".lp-dock-host")).toHaveCount(0);
});

test.describe("phones", () => {
  test.use({ viewport: { width: 375, height: 812 }, hasTouch: true });

  test("the portrait phone keeps its bottom sheet, with no move grip or dock to drag to (#432)", async ({ page }) => {
    await freshProfile(page);
    await page.goto("/decks");
    await openFromCompass(page);
    await expect(panel(page)).toHaveAttribute("data-phone", "true");
    await expect(panel(page).locator(".lp-move")).toHaveCount(0);
    expect(await panel(page).locator(".lp-resize").evaluateAll((els) => els.filter((e) => getComputedStyle(e).display !== "none").length)).toBe(0);
    await expect(panel(page)).not.toHaveAttribute("data-dock", /.+/);
    // Even with a side remembered from a desktop session, the sheet is a sheet.
    await page.evaluate(() => localStorage.setItem("optcg-logpose:dock", "right"));
    await page.reload();
    await openFromCompass(page);
    await expect(panel(page)).toHaveAttribute("data-phone", "true");
    expect(await page.evaluate(() => document.documentElement.dataset.lpDock)).toBeUndefined();
    const box = (await panel(page).boundingBox())!;
    expect(box.width).toBeCloseTo(375, 0);
    expect(await room(page)).toBeLessThanOrEqual(0);
    await shot(page, "10-phone-portrait-sheet");
    await page.getByRole("button", { name: "Close Log Pose" }).click();
    await expect(panel(page)).toHaveCount(0);
    await expect(compass(page)).toBeVisible();
  });
});

test.describe("landscape phone", () => {
  test.use({ viewport: { width: 812, height: 375 }, hasTouch: true });

  test("a landscape phone's board has no side columns, so the panel floats and dragging to an edge shows no dock (#432)", async ({ page, duel }) => {
    await duel.startPractice({ seed: 11 });
    await page.getByRole("button", { name: "Matchup brief", exact: true }).click();
    await expect(panel(page)).toBeVisible();
    await expect.poll(() => panel(page).evaluate((el) => el.getAnimations().length)).toBe(0);
    await expect(page.locator('[data-panel-col]')).toHaveCount(0);
    await dragHeader(page, { x: 808, y: 150 }, false);
    await expect(page.locator(".lp-dock-preview")).toHaveCount(0);
    await page.mouse.up();
    await expect(panel(page)).not.toHaveAttribute("data-dock", /.+/);
    await expect(page.locator(".lp-dock-host")).toHaveCount(0);
    expect(await page.evaluate(() => localStorage.getItem("optcg-logpose:dock"))).toBeNull();
    await shot(page, "11-phone-landscape-sheet");
  });
});
