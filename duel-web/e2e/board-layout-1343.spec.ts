import { test, expect, RED_VANILLA, type Page } from "./fixtures";

test.use({ legacyLayout: false });

const isDesktop = () => test.info().project.name === "desktop-1280";

type Box = { left: number; top: number; right: number; bottom: number; width: number; height: number };
async function box(page: Page, sel: string): Promise<Box> {
  return page.locator(sel).first().evaluate((el) => {
    const r = el.getBoundingClientRect();
    return { left: r.left, top: r.top, right: r.right, bottom: r.bottom, width: r.width, height: r.height };
  });
}

const DESKTOP_SIZES = [
  { width: 1280, height: 720 },
  { width: 1440, height: 900 },
  { width: 1920, height: 1080 },
];
const PHONE_SIZES = [
  { width: 375, height: 812 },
  { width: 812, height: 375 },
];
const MULLIGAN_SIZES = [...DESKTOP_SIZES.slice(0, 1), ...PHONE_SIZES];

for (const size of MULLIGAN_SIZES) {
  test(`the opening hand is shown large with the choice under it, all in view at ${size.width}x${size.height} (#1343)`, async ({ page }) => {
    const desktop = size.width >= 1000;
    test.skip(desktop !== isDesktop(), "each size runs in its own project");
    await page.setViewportSize(size);
    await page.goto("/demo?turn0&hand=5");
    const hand = page.locator(".mulligan-hand");
    await expect(hand).toBeVisible();
    await page.waitForTimeout(400);
    const cards = hand.locator(".mulligan-hand-cards .card-tile");
    await expect(cards).toHaveCount(5);
    const panel = await box(page, ".mulligan-hand");
    expect(panel.left, "panel inside the window").toBeGreaterThanOrEqual(0);
    expect(panel.right).toBeLessThanOrEqual(size.width);
    expect(panel.top).toBeGreaterThanOrEqual(0);
    expect(panel.bottom).toBeLessThanOrEqual(size.height);
    let lastBottom = 0;
    for (let i = 0; i < 5; i++) {
      const c = await cards.nth(i).evaluate((el) => {
        const r = el.getBoundingClientRect();
        return { left: r.left, top: r.top, right: r.right, bottom: r.bottom, width: r.width };
      });
      expect(c.width, `card ${i} is big enough to read`).toBeGreaterThanOrEqual(88);
      expect(c.left).toBeGreaterThanOrEqual(panel.left);
      expect(c.right).toBeLessThanOrEqual(panel.right);
      lastBottom = Math.max(lastBottom, c.bottom);
    }
    const keep = await box(page, '.mulligan-hand button:has-text("Keep opening hand")');
    const redo = await box(page, ".mulligan-hand button:has-text(\"Mulligan\")");
    expect(keep.top, "choice directly under the cards").toBeGreaterThanOrEqual(lastBottom);
    expect(keep.top - lastBottom).toBeLessThanOrEqual(24);
    expect(redo.top).toBeGreaterThanOrEqual(lastBottom);
    expect(keep.height).toBeGreaterThanOrEqual(44);
    expect(keep.bottom).toBeLessThanOrEqual(panel.bottom);
    // One gold button: Keep, not Mulligan.
    const gold = (sel: string) => page.locator(sel).first().evaluate((el) => getComputedStyle(el).backgroundImage.includes("gradient"));
    expect(await gold('.mulligan-hand button:has-text("Keep opening hand")')).toBe(true);
    expect(await gold('.mulligan-hand button:has-text("Mulligan")')).toBe(false);
    await expect(page.getByRole("button", { name: "Keep opening hand" })).toHaveCount(1);
  });
}

test("hovering an opening-hand card enlarges it on desktop (#1343)", async ({ page }) => {
  test.skip(!isDesktop(), "hover is a desktop gesture; a tap opens the card on phones");
  await page.goto("/demo?turn0&hand=5");
  await page.locator(".mulligan-hand").waitFor();
  await page.locator(".mulligan-hand-cards .card-tile").first().hover();
  await expect(page.locator(".card-preview-popup")).toBeVisible();
});

test("the hand in the side column shows two full rows at 1280x720 (#1343)", async ({ page }) => {
  test.skip(!isDesktop(), "the side column is the desktop layout");
  await page.setViewportSize({ width: 1280, height: 720 });
  await page.goto("/demo?full");
  const cards = page.locator(".rail-hand-cards");
  await cards.waitFor();
  await page.waitForTimeout(400);
  const frame = await box(page, ".rail-hand-cards");
  const tiles = cards.locator(".card-tile");
  const n = await tiles.count();
  expect(n).toBeGreaterThanOrEqual(6);
  const rows = new Set<number>();
  for (let i = 0; i < 6; i++) {
    const b = await tiles.nth(i).evaluate((el) => {
      const r = el.getBoundingClientRect();
      return { top: Math.round(r.top), bottom: r.bottom };
    });
    expect(b.bottom, `card ${i} fully visible`).toBeLessThanOrEqual(frame.bottom + 1);
    rows.add(b.top);
  }
  expect(rows.size).toBeGreaterThanOrEqual(2);
});

test("the hand beside the board is not a sliver on a sideways phone (#1343)", async ({ page }) => {
  test.skip(isDesktop(), "phone layout");
  await page.setViewportSize({ width: 812, height: 375 });
  await page.goto("/demo?full");
  const cards = page.locator(".rail-hand-cards");
  await cards.waitFor();
  await page.waitForTimeout(400);
  const frame = await box(page, ".rail-hand-cards");
  const tiles = cards.locator(".card-tile");
  for (let i = 0; i < 4; i++) {
    const b = await tiles.nth(i).evaluate((el) => el.getBoundingClientRect().bottom);
    expect(b, `card ${i} fully visible`).toBeLessThanOrEqual(frame.bottom + 1);
  }
});

test("each player is one compact line with name, order and the four numbers (#1343)", async ({ page }) => {
  test.skip(!isDesktop(), "the side column is the desktop layout");
  await page.setViewportSize({ width: 1280, height: 720 });
  await page.goto("/demo?full");
  for (const side of ["opp", "you"]) {
    const row = page.locator(`.turn-player-${side}`);
    await expect(row).toBeVisible();
    const r = await row.evaluate((el) => {
      const rect = el.getBoundingClientRect();
      const name = el.querySelector(".turn-player-name")!.getBoundingClientRect();
      const stats = el.querySelector(".turn-player-stats")!.getBoundingClientRect();
      const dd = Array.from(el.querySelectorAll("dd")).map((d) => parseFloat(getComputedStyle(d).fontSize));
      return { height: rect.height, sameLine: Math.abs(name.top - stats.top) < name.height, dd };
    });
    expect(r.height, `${side} row is one line tall`).toBeLessThan(46);
    expect(r.sameLine, `${side} numbers sit on the name's line`).toBe(true);
    expect(r.dd).toHaveLength(4);
    for (const f of r.dd) expect(f).toBeGreaterThanOrEqual(12);
  }
});

test("the clocks stay on the player lines (#1343)", async ({ page }) => {
  test.skip(!isDesktop(), "the side column is the desktop layout");
  await page.goto("/demo?clock");
  await expect(page.locator(".turn-player-opp .turn-player-clock")).toBeVisible();
  await expect(page.locator(".turn-player-you .turn-player-clock")).toBeVisible();
});

test("Play vs Bot has no chat (#1343)", async ({ page, duel }) => {
  await page.route(`${process.env.E2E_GAME_SERVER ?? "http://127.0.0.1:2567"}/matchmake/create/**`, (route) => {
    const body = JSON.parse(route.request().postData() ?? "{}");
    return route.continue({ postData: JSON.stringify({ ...body, seed: 7 }) });
  });
  const decks = [
    { id: "e2e-you", name: "E2E You", ...RED_VANILLA, updatedAt: 1 },
    { id: "e2e-opp", name: "E2E Opponent", ...RED_VANILLA, updatedAt: 0 },
  ];
  await page.addInitScript((d) => {
    if (sessionStorage.getItem("e2e-seeded")) return;
    sessionStorage.setItem("e2e-seeded", "1");
    localStorage.clear();
    localStorage.setItem("optcg.duel.savedDecks.v1", JSON.stringify(d));
    localStorage.setItem("optcg.duel.selectedDeckId.v1", "e2e-you");
  }, decks);
  await page.goto("/");
  await page.locator(".mode-tiles").getByRole("button", { name: /^Play vs Bot/ }).click();
  await page.getByRole("button", { name: "Start game" }).click();
  await expect(page.getByRole("button", { name: "Keep opening hand" })).toBeVisible({ timeout: 30_000 });
  await page.getByRole("button", { name: "Keep opening hand" }).click();
  await expect(page.locator(".board-root")).toHaveAttribute("data-phase", "main", { timeout: 30_000 });
  await expect(page.locator(".chat-panel")).toHaveCount(0);
  await expect(page.locator(".rating-chip")).toHaveCount(0);
  expect(duel.errors).toEqual([]);
});

// B10: hovering never leaves the action button under the pop-up.
for (const size of DESKTOP_SIZES) {
  for (const actionsBeside of [true, false]) {
    test(`the card preview never covers the action button at ${size.width}x${size.height} with Actions beside ${actionsBeside ? "on" : "off"} (#1343)`, async ({ page }) => {
      test.skip(!isDesktop(), "the pop-up is the desktop preview");
      await page.setViewportSize(size);
      await page.addInitScript((s) => localStorage.setItem("optcg-duel:settings", JSON.stringify(s)), { actionsBeside, previewPopup: true, bigBoardChosen: true });
      await page.goto("/demo?full");
      await page.locator(".primary-dock-main").waitFor();
      await page.waitForTimeout(500);
      const targets = [".rail-hand-cards .card-tile >> nth=0", ".rail-hand-cards .card-tile >> nth=3", '.side-you [data-instance-id="y-leader"]', ".side-you .characters-row .card-tile >> nth=0", ".side-opp .card-tile >> nth=0"];
      for (const target of targets) {
        const loc = page.locator(target);
        if ((await loc.count()) === 0) continue;
        await page.mouse.move(2, 2);
        await page.waitForTimeout(150);
        await loc.hover();
        await expect(page.locator(".card-preview-popup")).toBeVisible();
        await page.waitForTimeout(250);
        const covered = await page.evaluate(() => {
          const main = document.querySelector(".primary-dock-main")!.getBoundingClientRect();
          const hit = document.elementFromPoint(main.left + main.width / 2, main.top + main.height / 2);
          return { inPopup: hit?.closest(".card-preview-popup") != null, onButton: hit?.closest(".primary-dock-main") != null };
        });
        expect(covered.inPopup, `${target} pop-up over the button`).toBe(false);
        expect(covered.onButton, `${target} button reachable`).toBe(true);
      }
    });
  }
}
