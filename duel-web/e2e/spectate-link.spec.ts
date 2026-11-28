import type { BrowserContext, Page } from "@playwright/test";
import { SEATED_SPECTATOR_MESSAGE } from "@optcg/duel-protocol";
import { test, expect, mintGameToken, FAKE_API, GAME_SERVER, RED_VANILLA } from "./fixtures";

const NEAR_FAN = ".hand-fan:not(.hand-fan-top)";
const FAR_FAN = ".hand-fan-top";
const NEAR_HAND = `:is(.rail-hand-cards, .hand-row-inner, ${NEAR_FAN} .hand-fan-cards, .hand-dock-cards) .card-tile`;
const FAR_HAND = `:is(${FAR_FAN} .hand-fan-cards .card-tile, .spec-far-cards .card-tile, .opp-fan-face, .opp-hand-face) >> visible=true`;
const ENDED_MESSAGE = "That match has ended or the spectate link is wrong.";

async function newWatcher(browser: import("@playwright/test").Browser, use: object, uid = 99): Promise<{ ctx: BrowserContext; page: Page }> {
  const ctx = await browser.newContext({ ...use, permissions: ["clipboard-read", "clipboard-write"] });
  const page = await ctx.newPage();
  await page.addInitScript(() => {
    const key = "optcg-duel:settings";
    const cur = JSON.parse(localStorage.getItem(key) || "{}");
    localStorage.setItem(key, JSON.stringify({ sideColumns: "both", previewPopup: false, bigBoard: false, bigBoardChosen: true, ...cur }));
  });
  await page.route(`${FAKE_API}/**`, (route) => {
    const path = new URL(route.request().url()).pathname;
    if (path === "/health") return route.fulfill({ json: { ok: true } });
    if (path === "/duel/guest-token") {
      return route.fulfill({
        json: { token: mintGameToken(uid, "watcher"), expires_at: 0, user_id: uid, email: "watcher@e2e.test", rating: 1000, games_played: 0 },
      });
    }
    return route.fulfill({ status: 404, json: { detail: "not in e2e fake API" } });
  });
  return { ctx, page };
}

async function practiceRoomId(page: Page, duel: { startPractice(o: { seed: number }): Promise<void> }): Promise<string> {
  const created = page.waitForResponse((r) => /\/matchmake\/create\//.test(r.url()));
  await duel.startPractice({ seed: 7 });
  const body = (await (await created).json()) as { roomId?: string; room?: { roomId?: string } };
  const roomId = body.room?.roomId ?? body.roomId;
  expect(roomId).toBeTruthy();
  return roomId!;
}

test("opening /watch/<room id> goes straight to the board with both hands, and Back skips the link (#346)", async ({ page, duel, browser }, info) => {
  const roomId = await practiceRoomId(page, duel);
  const { ctx, page: spec } = await newWatcher(browser, info.project.use);
  await spec.goto(`/watch/${encodeURIComponent(roomId)}`);

  await expect(spec.locator(NEAR_HAND)).toHaveCount(5, { timeout: 30_000 });
  await expect(spec.locator(FAR_HAND)).toHaveCount(5);
  await expect(spec).toHaveURL(/\/duel$/);
  // The link entry was replaced: about:blank + the board, so Back can't re-join through it.
  expect(await spec.evaluate(() => history.length)).toBe(2);
  await spec.screenshot({ path: info.outputPath("watch-link-board.png") });
  await ctx.close();
  expect(duel.errors).toEqual([]);
});

test("/watch/<room id>?seat=2 puts the spectator's camera on player 2 (#346)", async ({ page, duel, browser }, info) => {
  const roomId = await practiceRoomId(page, duel);
  const { ctx, page: spec } = await newWatcher(browser, info.project.use);
  await spec.goto(`/watch/${encodeURIComponent(roomId)}?seat=2`);
  await expect(spec.locator(".board-root")).toHaveAttribute("data-seat", "1", { timeout: 30_000 });
  await ctx.close();
});

test("a room that does not exist lands in the lobby with a clear message (#346)", async ({ page, browser }, info) => {
  const { ctx, page: spec } = await newWatcher(browser, info.project.use);
  await spec.goto("/watch/nosuchroom");
  await expect(spec.getByText(ENDED_MESSAGE)).toBeVisible({ timeout: 30_000 });
  await expect(spec).toHaveURL(/\/$/);
  await spec.screenshot({ path: info.outputPath("watch-link-ended.png") });
  await ctx.close();
  void page;
});

test("a spectator who arrives before the match starts sees waiting, not an error (#346)", async ({ page, browser }, info) => {
  const created = page.waitForResponse((r) => /\/matchmake\/create\//.test(r.url()));
  await page.route(`${FAKE_API}/**`, (route) => {
    const path = new URL(route.request().url()).pathname;
    if (path === "/health") return route.fulfill({ json: { ok: true } });
    if (path === "/duel/guest-token") {
      return route.fulfill({
        json: { token: mintGameToken(1, "host"), expires_at: 0, user_id: 1, email: "host@e2e.test", rating: 1000, games_played: 0 },
      });
    }
    return route.fulfill({ status: 404, json: { detail: "not in e2e fake API" } });
  });
  await page.goto("/");
  await page.locator(".mode-tiles").getByRole("button", { name: /^Play a friend/ }).click();
  await page.getByRole("button", { name: "Create room" }).click();
  const body = (await (await created).json()) as { roomId?: string; room?: { roomId?: string } };
  const roomId = (body.room?.roomId ?? body.roomId)!;
  await expect(page.locator(".room-invite-id")).toHaveText(roomId);
  await page.screenshot({ path: info.outputPath("waiting-room-invite.png") });

  const { ctx, page: spec } = await newWatcher(browser, info.project.use);
  await spec.goto(`/watch/${encodeURIComponent(roomId)}`);
  await expect(spec.getByText("Waiting for the match to start…").first()).toBeVisible({ timeout: 30_000 });
  await spec.waitForTimeout(800);
  await expect(spec.locator(".error-banner")).toHaveCount(0);
  await expect(spec).toHaveURL(/\/duel$/);
  await ctx.close();
});

test("opening the watch link of a match you are seated in says so on the lobby, with no board (#1371)", async ({ page, browser }, info) => {
  const created = page.waitForResponse((r) => /\/matchmake\/create\//.test(r.url()));
  await page.route(`${FAKE_API}/**`, (route) => {
    const path = new URL(route.request().url()).pathname;
    if (path === "/health") return route.fulfill({ json: { ok: true } });
    if (path === "/duel/guest-token") {
      return route.fulfill({
        json: { token: mintGameToken(1, "host"), expires_at: 0, user_id: 1, email: "host@e2e.test", rating: 1000, games_played: 0 },
      });
    }
    return route.fulfill({ status: 404, json: { detail: "not in e2e fake API" } });
  });
  await page.goto("/");
  await page.locator(".mode-tiles").getByRole("button", { name: /^Play a friend/ }).click();
  await page.getByRole("button", { name: "Create room" }).click();
  const body = (await (await created).json()) as { roomId?: string; room?: { roomId?: string } };
  const roomId = (body.room?.roomId ?? body.roomId)!;
  await expect(page.locator(".room-invite-id")).toHaveText(roomId);

  // Same account (uid 1) in a second browser: it already holds the seat.
  const { ctx, page: spec } = await newWatcher(browser, info.project.use, 1);
  await spec.goto(`/watch/${encodeURIComponent(roomId)}`);
  await expect(spec.getByText(SEATED_SPECTATOR_MESSAGE)).toBeVisible({ timeout: 30_000 });
  // A phone sees it without scrolling.
  await expect(spec.getByRole("alert").filter({ hasText: SEATED_SPECTATOR_MESSAGE })).toBeInViewport();
  await expect(spec).toHaveURL(/\/$/);
  await expect(spec.locator(".board-root")).toHaveCount(0);
  await spec.screenshot({ path: info.outputPath("watch-own-match.png") });
  if (process.env.SHOTS_DIR) await spec.screenshot({ path: `${process.env.SHOTS_DIR}/watch-own-match-${info.project.name}.png` });
  await ctx.close();
});

test("a spectator copies a link from the HUD or the menu that opens the same match (#346)", async ({ page, duel, browser }, info) => {
  const roomId = await practiceRoomId(page, duel);
  const { ctx, page: spec } = await newWatcher(browser, info.project.use);
  await spec.goto(`/watch/${encodeURIComponent(roomId)}`);
  await expect(spec.locator(NEAR_HAND)).toHaveCount(5, { timeout: 30_000 });
  const expected = `${new URL(spec.url()).origin}/watch/${encodeURIComponent(roomId)}`;
  const phone = (info.project.use.viewport?.width ?? 1280) < 720;
  if (phone) {
    await spec.getByRole("button", { name: "Match menu" }).click();
    await spec.screenshot({ path: info.outputPath("match-menu.png") });
    await spec.getByRole("menuitem", { name: "Copy spectate link" }).click();
    await expect(spec.getByRole("menuitem", { name: "Copied" })).toBeVisible();
  } else {
    const btn = spec.getByRole("button", { name: "Copy spectate link" });
    const before = (await btn.boundingBox())!;
    const chip = (await spec.locator(".room-chip").boundingBox())!;
    await spec.screenshot({ path: info.outputPath("hud-watch-link.png") });
    await btn.click();
    await expect(btn).toHaveText("Copied");
    expect(await btn.boundingBox()).toEqual(before);
    expect(await spec.locator(".room-chip").boundingBox()).toEqual(chip);
  }
  expect(await spec.evaluate(() => navigator.clipboard.readText())).toBe(expected);
  await ctx.close();
});

type Box = { x: number; y: number; width: number; height: number };

async function boxes(page: Page, selector: string): Promise<Box[]> {
  const out: Box[] = [];
  for (const el of await page.locator(selector).all()) out.push((await el.boundingBox())!);
  return out;
}

const bottomOf = (bs: Box[]) => Math.max(...bs.map((b) => b.y + b.height));
const topOf = (bs: Box[]) => Math.min(...bs.map((b) => b.y));
const intersects = (a: Box, b: Box) =>
  a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height;

function expectOnScreen(bs: Box[], width: number, height: number) {
  for (const b of bs) {
    expect(b.x).toBeGreaterThanOrEqual(0);
    expect(b.y).toBeGreaterThanOrEqual(0);
    expect(b.x + b.width).toBeLessThanOrEqual(width);
    expect(b.y + b.height).toBeLessThanOrEqual(height);
  }
}

test("a desktop spectator sees both hands as fans, near at the bottom and far along the top, whatever the Hand setting (#346)", async ({ page, duel, browser }, info) => {
  test.skip(info.project.name !== "desktop-1280", "desktop layout");
  const roomId = await practiceRoomId(page, duel);
  const { ctx, page: spec } = await newWatcher(browser, info.project.use);
  await spec.goto(`/watch/${encodeURIComponent(roomId)}`);
  await expect(spec.locator(`${NEAR_FAN} .hand-fan-cards .card-tile`)).toHaveCount(5, { timeout: 30_000 });
  await expect(spec.locator(`${FAR_FAN} .hand-fan-cards .card-tile`)).toHaveCount(5);
  await expect(spec.locator(".rail-hand, .opp-hand-fan, .opp-hand-hint:visible")).toHaveCount(0);
  await spec.waitForTimeout(1500);

  const vp = spec.viewportSize()!;
  const near = await boxes(spec, `${NEAR_FAN} .hand-fan-cards .card-tile`);
  const far = await boxes(spec, `${FAR_FAN} .hand-fan-cards .card-tile`);
  const oppMat = (await spec.locator(".side-field.side-opp").boundingBox())!;
  const youMat = (await spec.locator(".side-field.side-you").boundingBox())!;
  const board = (await spec.locator(".playmat").boundingBox())!;
  expect(far[2]!.y + far[2]!.height).toBeLessThanOrEqual(oppMat.y + 1);
  expect(far[2]!.y).toBeLessThan(board.y);
  expect(near[2]!.y).toBeGreaterThanOrEqual(youMat.y + youMat.height - 1);
  expect(near[2]!.y + near[2]!.height).toBeGreaterThan(vp.height);
  const farMid = (Math.min(...far.map((b) => b.x)) + Math.max(...far.map((b) => b.x + b.width))) / 2;
  expect(Math.abs(farMid - (board.x + board.width / 2))).toBeLessThan(24);
  expect(Math.abs(near[0]!.width - far[0]!.width)).toBeLessThan(1);
  expect(near[2]!.y + near[2]!.height).toBeLessThan(near[0]!.y + near[0]!.height);
  expect(far[2]!.y).toBeGreaterThan(far[0]!.y + far[0]!.height * 0.06);
  const tilts = await spec.locator(`${FAR_FAN} .hand-fan-cards .card-tile`).evaluateAll((els) =>
    els.map((el) => {
      const m = new DOMMatrix(getComputedStyle(el).transform);
      return Math.abs((Math.atan2(m.b, m.a) * 180) / Math.PI);
    }),
  );
  for (const deg of tilts) expect(deg).toBeLessThan(45);
  const mid = far[2]!;
  await spec.mouse.move(mid.x + mid.width / 2, mid.y + mid.height - 6);
  await expect(spec.locator(".card-preview:not(.card-preview-empty) .card-preview-name")).toBeVisible();
  await spec.waitForTimeout(500);
  expectOnScreen(await boxes(spec, `${FAR_FAN} .hand-fan-cards .card-tile`), vp.width, vp.height);
  await spec.screenshot({ path: info.outputPath("fans-desktop-far-raised.png") });
  await spec.mouse.move(vp.width / 2, vp.height / 2);
  await spec.screenshot({ path: info.outputPath("fans-desktop.png") });
  await ctx.close();
  expect(duel.errors).toEqual([]);
});

test("a portrait phone spectator sees a row of small cards for each hand (#346)", async ({ page, duel, browser }, info) => {
  test.skip(info.project.name !== "phone-375", "portrait phone layout");
  const roomId = await practiceRoomId(page, duel);
  const { ctx, page: spec } = await newWatcher(browser, info.project.use);
  await spec.goto(`/watch/${encodeURIComponent(roomId)}`);
  await expect(spec.locator(".hand-row-spec-grid .card-tile")).toHaveCount(5, { timeout: 30_000 });
  await expect(spec.locator(".spec-far-cards .card-tile")).toHaveCount(5);
  const far = await boxes(spec, ".spec-far-cards .card-tile");
  const oppMat = (await spec.locator(".side-field.side-opp").boundingBox())!;
  expect(bottomOf(far)).toBeLessThanOrEqual(oppMat.y);
  expect(topOf(far)).toBeGreaterThanOrEqual((await spec.locator(".playmat").boundingBox())!.y);
  for (const pill of [spec.getByRole("button", { name: "Chat" }), spec.locator(".battle-log")]) {
    const pb = (await pill.first().boundingBox())!;
    for (const card of far) expect(intersects(card, pb)).toBe(false);
  }
  await spec.screenshot({ path: info.outputPath("fans-phone.png") });
  await ctx.close();
  expect(duel.errors).toEqual([]);
});

test.describe("landscape phone", () => {
  test.use({ viewport: { width: 812, height: 375 }, hasTouch: true });

  test("the waiting room card with the spectate link fits a landscape phone (#346)", async ({ page }, info) => {
    test.skip(info.project.name !== "phone-375", "one landscape run is enough");
    await page.route(`${FAKE_API}/**`, (route) => {
      const path = new URL(route.request().url()).pathname;
      if (path === "/health") return route.fulfill({ json: { ok: true } });
      if (path === "/duel/guest-token") {
        return route.fulfill({
          json: { token: mintGameToken(1, "host"), expires_at: 0, user_id: 1, email: "host@e2e.test", rating: 1000, games_played: 0 },
        });
      }
      return route.fulfill({ status: 404, json: { detail: "not in e2e fake API" } });
    });
    await page.goto("/");
    await page.locator(".mode-tiles").getByRole("button", { name: /^Play a friend/ }).click();
    await page.getByRole("button", { name: "Create room" }).click();
    await expect(page.locator(".room-invite-id")).toBeVisible({ timeout: 30_000 });
    const card = (await page.locator(".room-invite").boundingBox())!;
    expect(card.x).toBeGreaterThanOrEqual(0);
    expect(card.width).toBeGreaterThan(300);
    expect(card.x + card.width).toBeLessThanOrEqual(812);
    expect(card.y + card.height).toBeLessThanOrEqual(375);
    await expect(page.getByRole("button", { name: "Copy spectate link" })).toBeInViewport({ ratio: 1 });
    await page.screenshot({ path: info.outputPath("waiting-room-landscape.png") });
  });

  test("a landscape phone spectator sees both hands as small card grids in the right column, clear of the mats (#346)", async ({ page, duel, browser }, info) => {
    test.skip(info.project.name !== "phone-375", "one landscape run is enough");
    const roomId = await practiceRoomId(page, duel);
    const { ctx, page: spec } = await newWatcher(browser, { ...info.project.use, viewport: { width: 812, height: 375 } });
    await spec.goto(`/watch/${encodeURIComponent(roomId)}`);
    await expect(spec.locator(".rail-hand-spec .card-tile")).toHaveCount(5, { timeout: 30_000 });
    await expect(spec.locator(".spec-far-cards .card-tile")).toHaveCount(5);
    const near = await boxes(spec, ".rail-hand-spec .card-tile");
    const far = await boxes(spec, ".spec-far-cards .card-tile");
    expectOnScreen([...near, ...far], 812, 375);
    expect(bottomOf(far)).toBeLessThanOrEqual(topOf(near));
    for (const mat of await boxes(spec, ".side-field")) {
      for (const card of [...near, ...far]) expect(intersects(card, mat)).toBe(false);
    }
    await spec.screenshot({ path: info.outputPath("fans-landscape.png") });
    await ctx.close();
    expect(duel.errors).toEqual([]);
  });
});

async function labelStyle(page: Page, scope: string) {
  return page.locator(`${scope} .hand-label`).first().evaluate((el) => {
    const cs = getComputedStyle(el);
    const n = el.querySelector(".hand-label-name")!;
    const c = el.querySelector(".hand-label-count")!;
    const pick = (e: Element, keys: string[]) => keys.map((k) => getComputedStyle(e).getPropertyValue(k)).join("|");
    return {
      pill: pick(el, ["font-size", "font-weight", "font-family", "letter-spacing", "padding-left", "padding-right", "min-height", "color", "background-color", "border-top-color", "border-radius", "text-transform"]),
      name: pick(n, ["color", "font-weight"]),
      count: pick(c, ["color", "font-weight", "font-size"]),
      cs: cs.display,
    };
  });
}

async function toggleStyle(page: Page, scope: string) {
  return page.locator(`${scope} .hand-fan-toggle`).evaluate((el) => {
    const keys = ["font-size", "font-weight", "font-family", "letter-spacing", "padding-left", "padding-right", "min-height", "color", "background-color", "border-top-color", "border-radius", "text-transform"];
    const pick = (e: Element) => keys.map((k) => getComputedStyle(e).getPropertyValue(k)).join("|");
    return { pill: pick(el), count: pick(el.querySelector(".hand-rail-count")!) };
  });
}

async function labelBox(page: Page, scope: string): Promise<Box> {
  return (await page.locator(`${scope} .hand-label`).first().boundingBox())!;
}

const NEAR_LABEL = ":is(.rail-hand-spec, .hand-rail-head-spec)";
const FAR_LABEL = ".spec-far";

test("the two desktop hand buttons match and line up, and each fan is draggable by its grip, at 1280x720 and 1440x900 (#346)", async ({ page, duel, browser }, info) => {
  test.skip(info.project.name !== "desktop-1280", "desktop layout (the sizes are set here)");
  const roomId = await practiceRoomId(page, duel);
  for (const size of [
    { width: 1280, height: 720 },
    { width: 1440, height: 900 },
  ]) {
      const { ctx, page: spec } = await newWatcher(browser, { ...info.project.use, viewport: size });
      await spec.goto(`/watch/${encodeURIComponent(roomId)}`);
      await expect(spec.locator(`${NEAR_FAN} .hand-fan-cards .card-tile`)).toHaveCount(5, { timeout: 30_000 });
      await expect(spec.locator(`${FAR_FAN} .hand-fan-cards .card-tile`)).toHaveCount(5);

      expect(await toggleStyle(spec, NEAR_FAN)).toEqual(await toggleStyle(spec, FAR_FAN));
      await expect(spec.locator(`${NEAR_FAN} .hand-fan-toggle`)).toHaveText(/seat1 hand\s*5/i);
      await expect(spec.locator(`${FAR_FAN} .hand-fan-toggle`)).toHaveText(/seat2 hand\s*5/i);
      const near = (await spec.locator(`${NEAR_FAN} .hand-fan-toggle`).boundingBox())!;
      const far = (await spec.locator(`${FAR_FAN} .hand-fan-toggle`).boundingBox())!;
      expect(Math.abs(near.x - far.x)).toBeLessThan(1);
      const board = (await spec.locator(".playmat").boundingBox())!;
      expect(near.x).toBeGreaterThanOrEqual(board.x);
      expectOnScreen([near, far], size.width, size.height);
      await spec.waitForTimeout(1500);
      await spec.screenshot({ path: info.outputPath(`fans-desktop-${size.width}x${size.height}.png`) });

      const oppMat = () => spec.locator(".side-field.side-opp").boundingBox().then((b) => b!);
      const oppY0 = (await oppMat()).y;
      const oppH0 = (await oppMat()).height;
      const farGrip = spec.locator(`${FAR_FAN} .hand-fan-grip`);
      const nearGrip = spec.locator(`${NEAR_FAN} .hand-fan-grip`);
      await expect(farGrip).toHaveCount(1);
      await expect(nearGrip).toHaveCount(1);

      const drag = async (grip: import("@playwright/test").Locator, to: { x: number; y: number }) => {
        const b = (await grip.boundingBox())!;
        await spec.mouse.move(b.x + b.width / 2, b.y + b.height / 2);
        await spec.mouse.down();
        await spec.mouse.move(to.x, to.y, { steps: 12 });
        await spec.mouse.up();
      };

      await drag(farGrip, { x: size.width * 0.78, y: size.height * 0.5 });
      await expect(spec.locator(`${FAR_FAN}.hand-fan-float`)).toHaveCount(1);
      await expect(spec.locator(".arena-fan-top")).toHaveCount(0);
      const floating = await boxes(spec, `${FAR_FAN}.hand-fan-float .hand-fan-cards .card-tile`);
      expectOnScreen(floating, size.width, size.height);
      expect(floating).toHaveLength(5);
      await expect.poll(async () => Math.abs((await oppMat()).y - oppY0) + ((await oppMat()).height - oppH0)).toBeGreaterThan(8);
      const saved = await spec.evaluate(() => JSON.parse(localStorage.getItem("optcg-duel:settings") ?? "{}") as Record<string, unknown>);
      expect(saved.spectatorFarFanPos).toMatch(/^[\d.]+,[\d.]+$/);
      expect(saved.handFanPos ?? "").toBe("");
      expect(await toggleStyle(spec, FAR_FAN)).toEqual(await toggleStyle(spec, NEAR_FAN));
      await spec.screenshot({ path: info.outputPath(`fans-desktop-${size.width}x${size.height}-far-moved.png`) });

      await drag(nearGrip, { x: size.width * 0.3, y: size.height * 0.6 });
      await expect(spec.locator(`${NEAR_FAN}.hand-fan-float`)).toHaveCount(1);
      expectOnScreen(await boxes(spec, `${NEAR_FAN} .hand-fan-cards .card-tile`), size.width, size.height);
      await expect(spec.locator(".arena-fan-center")).toHaveCount(0);
      await expect.poll(async () => (await spec.evaluate(() => JSON.parse(localStorage.getItem("optcg-duel:settings") ?? "{}") as Record<string, string>)).spectatorNearFanPos).toMatch(/^[\d.]+,[\d.]+$/);
      if (size.width === 1440) await spec.screenshot({ path: info.outputPath("fans-desktop-1440x900-dragged.png") });

      const board2 = (await spec.locator(".playmat").boundingBox())!;
      const farBox = (await spec.locator(`${FAR_FAN}.hand-fan-float`).boundingBox())!;
      await drag(spec.locator(`${FAR_FAN} .hand-fan-grip`), {
        x: board2.x + board2.width / 2 - farBox.width / 2 + 14 + 10,
        y: board2.y + 6 + 15,
      });
      await expect(spec.locator(`${FAR_FAN}.hand-fan-float`)).toHaveCount(0);
      await expect.poll(async () => Math.abs((await oppMat()).y - oppY0)).toBeLessThan(2);
      await ctx.close();
  }
  expect(duel.errors).toEqual([]);
});

test("a desktop spectator redocks each moved hand by dropping its grip back where it was (#936)", async ({ page, duel, browser }, info) => {
  test.skip(info.project.name !== "desktop-1280", "desktop layout (the size is set here)");
  const roomId = await practiceRoomId(page, duel);
  const size = { width: 1280, height: 720 };
  const { ctx, page: spec } = await newWatcher(browser, { ...info.project.use, viewport: size });
  await spec.goto(`/watch/${encodeURIComponent(roomId)}`);
  await expect(spec.locator(`${NEAR_FAN} .hand-fan-cards .card-tile`)).toHaveCount(5, { timeout: 30_000 });
  await expect(spec.locator(`${FAR_FAN} .hand-fan-cards .card-tile`)).toHaveCount(5);
  await spec.waitForTimeout(1500);

  const setting = (key: string) =>
    spec.evaluate((k) => (JSON.parse(localStorage.getItem("optcg-duel:settings") ?? "{}") as Record<string, string>)[k] ?? "", key);
  const centre = async (grip: import("@playwright/test").Locator) => {
    const b = (await grip.boundingBox())!;
    return { x: b.x + b.width / 2, y: b.y + b.height / 2 };
  };

  for (const fan of [
    { name: "far", grip: `${FAR_FAN} .hand-fan-grip`, float: `${FAR_FAN}.hand-fan-float`, key: "spectatorFarFanPos", target: ".spec-dock-target-far" },
    { name: "near", grip: `${NEAR_FAN} .hand-fan-grip`, float: `${NEAR_FAN}.hand-fan-float`, key: "spectatorNearFanPos", target: ".spec-dock-target-near" },
  ]) {
    const grip = spec.locator(fan.grip);
    const home = await centre(grip);
    expect(await setting(fan.key), `${fan.name} starts docked`).toBe("");
    await expect(spec.locator(fan.float)).toHaveCount(0);
    await expect(spec.locator(".spec-dock-target")).toHaveCount(0);

    // Grab the docked fan and carry it out: its grip stays under the pointer (a docked grip sits at the
    // board's edge, a floating one at the cards' edge, so the fan has to shift to keep it there).
    await spec.mouse.move(home.x, home.y);
    await spec.mouse.down();
    await spec.mouse.move(home.x + 6, home.y - 6, { steps: 3 });
    await spec.mouse.move(900, 400, { steps: 12 });
    const held = await centre(grip);
    expect(Math.abs(held.x - 900), `${fan.name} grip stays under the pointer (x)`).toBeLessThan(20);
    expect(Math.abs(held.y - 400), `${fan.name} grip stays under the pointer (y)`).toBeLessThan(20);

    await expect(spec.locator(fan.target)).toBeVisible();
    await expect(spec.locator(fan.target)).not.toHaveClass(/is-active/);
    await spec.mouse.up();
    await expect(spec.locator(fan.float)).toHaveCount(1);
    await expect(spec.locator(".spec-dock-target")).toHaveCount(0);
    expect(await setting(fan.key)).toMatch(/^[\d.]+,[\d.]+$/);

    const out = await centre(grip);
    await spec.mouse.move(out.x, out.y);
    await spec.mouse.down();
    await spec.mouse.move(home.x, home.y, { steps: 14 });
    await expect(spec.locator(fan.target)).toHaveClass(/is-active/);
    await spec.mouse.up();
    await expect(spec.locator(fan.float), `${fan.name} fan redocked`).toHaveCount(0);
    expect(await setting(fan.key)).toBe("");
    await expect(spec.locator(".spec-dock-target")).toHaveCount(0);
  }
  await ctx.close();
  expect(duel.errors).toEqual([]);
});

test("both phone layouts label the two hands with the same pill, lined up (#346)", async ({ page, duel, browser }, info) => {
  test.skip(info.project.name !== "phone-375", "phone layout");
  const roomId = await practiceRoomId(page, duel);
  const { ctx, page: spec } = await newWatcher(browser, info.project.use);
  await spec.goto(`/watch/${encodeURIComponent(roomId)}`);
  await expect(spec.locator(".hand-row-spec-grid .card-tile")).toHaveCount(5, { timeout: 30_000 });
  await expect(spec.locator(".spec-far-cards .card-tile")).toHaveCount(5);
  expect(await labelStyle(spec, NEAR_LABEL)).toEqual(await labelStyle(spec, FAR_LABEL));
  const nearP = await labelBox(spec, NEAR_LABEL);
  const farP = await labelBox(spec, FAR_LABEL);
  expect(Math.abs(nearP.x + nearP.width / 2 - (farP.x + farP.width / 2))).toBeLessThan(1);
  expect(Math.abs(nearP.x + nearP.width / 2 - 375 / 2)).toBeLessThan(2);
  for (const pill of [spec.getByRole("button", { name: "Chat" }), spec.locator(".battle-log")]) {
    expect(intersects(farP, (await pill.first().boundingBox())!)).toBe(false);
  }
  await spec.waitForTimeout(1500);
  await spec.screenshot({ path: info.outputPath("fans-phone-375x812.png") });
  await ctx.close();

  const land = await newWatcher(browser, { ...info.project.use, viewport: { width: 812, height: 375 } });
  await land.page.goto(`/watch/${encodeURIComponent(roomId)}`);
  await expect(land.page.locator(".rail-hand-spec .card-tile")).toHaveCount(5, { timeout: 30_000 });
  expect(await labelStyle(land.page, NEAR_LABEL)).toEqual(await labelStyle(land.page, FAR_LABEL));
  const nearL = await labelBox(land.page, NEAR_LABEL);
  const farL = await labelBox(land.page, FAR_LABEL);
  expect(Math.abs(nearL.x - farL.x)).toBeLessThan(1);
  await land.page.waitForTimeout(1500);
  await land.page.screenshot({ path: info.outputPath("fans-phone-812x375.png") });
  await land.ctx.close();
  expect(duel.errors).toEqual([]);
});

const HAND_CARDS = ":is(.rail-hand-cards, .hand-row-inner, .hand-fan-cards, .hand-dock-cards) > .card-tile";
const motionIds = (page: Page) => page.locator(HAND_CARDS).evaluateAll((els) => els.map((e) => e.getAttribute("data-motion-id")));
const tileNames = (page: Page, selector: string) =>
  page.locator(selector).evaluateAll((els) =>
    els.map((e) => /([A-Za-z][^\d]*? Cost \d+)/.exec(((e as HTMLElement).innerText || "").replace(/\s+/g, " "))?.[1]?.trim() ?? ""),
  );

async function newPlayer(browser: import("@playwright/test").Browser, use: object, uid: number, name: string) {
  const ctx = await browser.newContext({ ...use });
  const page = await ctx.newPage();
  const decks = [{ id: "e2e-you", name: "E2E You", ...RED_VANILLA, updatedAt: 1 }];
  await page.addInitScript((d) => {
    if (sessionStorage.getItem("e2e-seeded")) return;
    sessionStorage.setItem("e2e-seeded", "1");
    localStorage.clear();
    localStorage.setItem("optcg.duel.savedDecks.v1", JSON.stringify(d));
    localStorage.setItem("optcg.duel.selectedDeckId.v1", "e2e-you");
    localStorage.setItem("optcg-duel:settings", JSON.stringify({ handLayout: "fan" }));
  }, decks);
  await page.route(`${FAKE_API}/**`, (route) => {
    const path = new URL(route.request().url()).pathname;
    if (path === "/health") return route.fulfill({ json: { ok: true } });
    if (path === "/duel/guest-token") {
      return route.fulfill({
        json: { token: mintGameToken(uid, name), expires_at: 0, user_id: uid, email: `${name}@e2e.test`, rating: 1000, games_played: 0 },
      });
    }
    return route.fulfill({ status: 404, json: { detail: "not in e2e fake API" } });
  });
  return { ctx, page };
}

test("a spectator's fans follow each player's Sort and card drags (#346)", async ({ browser }, info) => {
  const host = await newPlayer(browser, info.project.use, 21, "host");
  const created = host.page.waitForResponse((r) => /\/matchmake\/create\//.test(r.url()));
  await host.page.route(`${GAME_SERVER}/matchmake/create/**`, (route) => {
    const body = JSON.parse(route.request().postData() ?? "{}");
    return route.continue({ postData: JSON.stringify({ ...body, seed: 7 }) });
  });
  await host.page.goto("/");
  await host.page.locator(".mode-tiles").getByRole("button", { name: /^Play a friend/ }).click();
  await host.page.getByRole("button", { name: "Create room" }).click();
  const body = (await (await created).json()) as { roomId?: string; room?: { roomId?: string } };
  const roomId = (body.room?.roomId ?? body.roomId)!;
  await expect(host.page.locator(".room-invite-id")).toHaveText(roomId);

  const guest = await newPlayer(browser, info.project.use, 22, "guest");
  await guest.page.goto(`/?join=${encodeURIComponent(roomId)}`);
  await guest.page.getByRole("button", { name: "Join room" }).click();

  const watch = await newWatcher(browser, info.project.use);
  await watch.page.addInitScript(() => localStorage.setItem("optcg-duel:settings", JSON.stringify({ sortHandByCost: true })));
  await watch.page.goto(`/watch/${encodeURIComponent(roomId)}`);
  const phone = (info.project.use.viewport?.width ?? 1280) < 720;
  const specNear = phone ? ".hand-row-spec-grid .card-tile" : `${NEAR_FAN} .hand-fan-cards .card-tile`;
  const specFar = phone ? ".spec-far-cards .card-tile" : `${FAR_FAN} .hand-fan-cards .card-tile`;
  await expect(watch.page.locator(specNear)).toHaveCount(5, { timeout: 30_000 });
  await expect(watch.page.locator(specFar)).toHaveCount(5);
  await expect(host.page.locator(HAND_CARDS)).toHaveCount(5, { timeout: 30_000 });
  await expect(guest.page.locator(HAND_CARDS)).toHaveCount(5, { timeout: 30_000 });

  const players = [host.page, guest.page];
  const nearIds = () => watch.page.locator(specNear).evaluateAll((els) => els.map((e) => e.getAttribute("data-motion-id")));
  const farNames = () => tileNames(watch.page, specFar);
  let nearPlayer = players[0]!;
  let farPlayer = players[1]!;
  if (JSON.stringify(await motionIds(guest.page)) === JSON.stringify(await nearIds())) [nearPlayer, farPlayer] = [guest.page, host.page];
  await expect.poll(nearIds).toEqual(await motionIds(nearPlayer));
  const click = async (page: Page) =>
    page.locator(".hand-rail-btn", { hasText: "Sort" }).locator("visible=true").first().click();

  const unsortedNear = await motionIds(nearPlayer);
  await click(nearPlayer);
  await expect.poll(() => motionIds(nearPlayer)).not.toEqual(unsortedNear);
  const sortedNear = await motionIds(nearPlayer);
  await expect.poll(nearIds, { timeout: 10_000 }).toEqual(sortedNear);
  await watch.page.screenshot({ path: info.outputPath("hand-order-near-sorted.png") });

  const unsortedFar = await tileNames(farPlayer, HAND_CARDS);
  expect(await farNames()).toEqual(unsortedFar);
  await click(farPlayer);
  await expect.poll(() => tileNames(farPlayer, HAND_CARDS)).not.toEqual(unsortedFar);
  const sortedFar = await tileNames(farPlayer, HAND_CARDS);
  await expect.poll(farNames, { timeout: 10_000 }).toEqual(sortedFar);

  await click(nearPlayer);
  await expect.poll(() => motionIds(nearPlayer)).toEqual(unsortedNear);
  if (!phone) {
    const cards = nearPlayer.locator(HAND_CARDS);
    const last = cards.nth(4);
    let bl = (await last.boundingBox())!;
    // Hover first: a fanned hand raises under the pointer, so the card is picked up where it ends up.
    await nearPlayer.mouse.move(bl.x + bl.width / 2, bl.y + 12);
    await nearPlayer.waitForTimeout(450);
    bl = (await last.boundingBox())!;
    const b1 = (await cards.nth(1).boundingBox())!;
    await nearPlayer.mouse.move(bl.x + bl.width / 2, bl.y + bl.height / 2);
    await nearPlayer.mouse.down();
    await nearPlayer.mouse.move(bl.x + bl.width / 2, bl.y + bl.height / 2 - 14, { steps: 4 });
    await nearPlayer.mouse.move(b1.x + b1.width * 0.15, b1.y + b1.height / 2, { steps: 10 });
    await nearPlayer.mouse.up();
    // Where the player's own drag lands is the existing drag-reorder's business (it varies a little with
    // the fan's hover state), so only require that it moved the hand; the spectator must then show exactly
    // the order the player ended up with.
    await expect.poll(() => motionIds(nearPlayer)).not.toEqual(unsortedNear);
    const dragged = await motionIds(nearPlayer);
    expect([...dragged].sort()).toEqual([...unsortedNear].sort());
    await expect.poll(nearIds, { timeout: 10_000 }).toEqual(dragged);
    await nearPlayer.mouse.move(5, 5);
    await nearPlayer.waitForTimeout(500);
    await watch.page.screenshot({ path: info.outputPath("hand-order-player-vs-spectator.png") });
    await nearPlayer.screenshot({ path: info.outputPath("hand-order-player.png") });
  }
  await Promise.all([host.ctx.close(), guest.ctx.close(), watch.ctx.close()]);
});
