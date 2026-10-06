/**
 * Spectate links (#346): `/watch/<room id>` opens straight into spectating, and
 * a bad or finished room says so back in the lobby.
 */
import type { BrowserContext, Page } from "@playwright/test";
import { test, expect, mintGameToken, FAKE_API, RED_VANILLA } from "./fixtures";

const NEAR_HAND = ":is(.rail-hand-cards, .hand-row-inner, .hand-fan-cards, .hand-dock-cards) .card-tile";
const FAR_HAND = ":is(.spec-far-cards .card-tile, .opp-fan-face, .opp-hand-face) >> visible=true";
const ENDED_MESSAGE = "That match has ended or the spectate link is wrong.";

async function newWatcher(browser: import("@playwright/test").Browser, use: object): Promise<{ ctx: BrowserContext; page: Page }> {
  const ctx = await browser.newContext({ ...use, permissions: ["clipboard-read", "clipboard-write"] });
  const page = await ctx.newPage();
  await page.route(`${FAKE_API}/**`, (route) => {
    const path = new URL(route.request().url()).pathname;
    if (path === "/health") return route.fulfill({ json: { ok: true } });
    if (path === "/duel/guest-token") {
      return route.fulfill({
        json: { token: mintGameToken(99, "watcher"), expires_at: 0, user_id: 99, email: "watcher@e2e.test", rating: 1000, games_played: 0 },
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
  await page.getByRole("button", { name: "Play", exact: true }).click();
  await page.getByRole("button", { name: /^Private room/ }).click();
  await page.getByRole("button", { name: "Create room" }).click();
  const body = (await (await created).json()) as { roomId?: string; room?: { roomId?: string } };
  const roomId = (body.room?.roomId ?? body.roomId)!;
  await expect(page.locator(".room-invite-id")).toHaveText(roomId);
  await page.screenshot({ path: info.outputPath("waiting-room-invite.png") });

  const { ctx, page: spec } = await newWatcher(browser, info.project.use);
  await spec.goto(`/watch/${encodeURIComponent(roomId)}`);
  await expect(spec.getByText("Waiting for the match to start…").first()).toBeVisible({ timeout: 30_000 });
  // The server's "match_not_ready" is not a problem to report.
  await spec.waitForTimeout(800);
  await expect(spec.locator(".error-banner")).toHaveCount(0);
  await expect(spec).toHaveURL(/\/duel$/);
  await ctx.close();
});

test("a spectator copies a link from the HUD or the menu that opens the same match (#346)", async ({ page, duel, browser }, info) => {
  // A practice match is hotseat for its player (no room to share); the watcher is an online seat.
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
    // The label flips without resizing the button or the chip beside the other controls.
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

/** Every box lies inside the window (nothing clipped off an edge). */
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
  // No fixture override here: the watcher's Hand setting is the default "auto" (the Grid on a 720px window).
  const { ctx, page: spec } = await newWatcher(browser, info.project.use);
  await spec.goto(`/watch/${encodeURIComponent(roomId)}`);
  await expect(spec.locator(".hand-fan-cards .card-tile")).toHaveCount(5, { timeout: 30_000 });
  await expect(spec.locator(".spec-far-cards .card-tile")).toHaveCount(5);
  // The Grid hand and the small rail fan are gone: the fans are the only hands.
  await expect(spec.locator(".rail-hand, .opp-hand-fan, .opp-hand-hint:visible")).toHaveCount(0);

  const vp = spec.viewportSize()!;
  const near = await boxes(spec, ".hand-fan-cards .card-tile");
  const far = await boxes(spec, ".spec-far-cards .card-tile");
  const oppMat = (await spec.locator(".side-field.side-opp").boundingBox())!;
  const youMat = (await spec.locator(".side-field.side-you").boundingBox())!;
  // Far fan: hangs above the opponent's mat, centred over the board column, wholly on screen.
  expect(bottomOf(far)).toBeLessThanOrEqual(oppMat.y);
  const board = (await spec.locator(".playmat").boundingBox())!;
  // ...and the row reserved for it is tall enough that no card is clipped off the top of the board.
  expect(topOf(far)).toBeGreaterThanOrEqual(board.y);
  const farMid = (Math.min(...far.map((b) => b.x)) + Math.max(...far.map((b) => b.x + b.width))) / 2;
  expect(Math.abs(farMid - (board.x + board.width / 2))).toBeLessThan(12);
  // Near fan: raised below your mat, fully visible (not tucked behind the window edge).
  expect(topOf(near)).toBeGreaterThanOrEqual(youMat.y + youMat.height);
  expectOnScreen(near, vp.width, vp.height);
  // The far cards are about as big as the near ones.
  expect(Math.abs(near[0]!.width - far[0]!.width)).toBeLessThan(near[0]!.width * 0.3);
  // Mirrored arc: the outer cards of the near fan sit lower than its middle card, those of the far fan higher, and the far cards stay upright.
  expect(near[2]!.y + near[2]!.height).toBeLessThan(near[0]!.y + near[0]!.height);
  expect(far[2]!.y).toBeGreaterThan(far[0]!.y + far[0]!.height * 0.06);
  const tilts = await spec.locator(".spec-far-cards .card-tile").evaluateAll((els) =>
    els.map((el) => {
      const m = new DOMMatrix(getComputedStyle(el).transform);
      return Math.abs((Math.atan2(m.b, m.a) * 180) / Math.PI);
    }),
  );
  for (const deg of tilts) expect(deg).toBeLessThan(45);
  // Reading a far card: pointing at it shows it in the preview column.
  const mid = far[2]!;
  await spec.mouse.move(mid.x + mid.width / 2, mid.y + mid.height / 2);
  await expect(spec.locator(".card-preview:not(.card-preview-empty) .card-preview-name")).toBeVisible();
  await spec.mouse.move(vp.width / 2, vp.height / 2);
  await spec.screenshot({ path: info.outputPath("fans-desktop.png") });
  await ctx.close();
  expect(duel.errors).toEqual([]);
});

test("a portrait phone spectator sees an overlapped fan strip for each hand (#346)", async ({ page, duel, browser }, info) => {
  test.skip(info.project.name !== "phone-375", "portrait phone layout");
  const roomId = await practiceRoomId(page, duel);
  const { ctx, page: spec } = await newWatcher(browser, info.project.use);
  await spec.goto(`/watch/${encodeURIComponent(roomId)}`);
  await expect(spec.locator(".hand-row-fan .card-tile")).toHaveCount(5, { timeout: 30_000 });
  await expect(spec.locator(".spec-far-cards .card-tile")).toHaveCount(5);
  const far = await boxes(spec, ".spec-far-cards .card-tile");
  const oppMat = (await spec.locator(".side-field.side-opp").boundingBox())!;
  // The strip sits above the top mat and clear of the Chat button and Battle log pill that float over the top of the board.
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
    await page.getByRole("button", { name: "Play", exact: true }).click();
    await page.getByRole("button", { name: /^Private room/ }).click();
    await page.getByRole("button", { name: "Create room" }).click();
    await expect(page.locator(".room-invite-id")).toBeVisible({ timeout: 30_000 });
    // The waiting board used to drop its mat (and the card on it) into the 44px icon-rail column.
    const card = (await page.locator(".room-invite").boundingBox())!;
    expect(card.x).toBeGreaterThanOrEqual(0);
    expect(card.width).toBeGreaterThan(300);
    expect(card.x + card.width).toBeLessThanOrEqual(812);
    expect(card.y + card.height).toBeLessThanOrEqual(375);
    await expect(page.getByRole("button", { name: "Copy spectate link" })).toBeInViewport({ ratio: 1 });
    await page.screenshot({ path: info.outputPath("waiting-room-landscape.png") });
  });

  test("a landscape phone spectator sees both hands as small fans in the right column, clear of the mats (#346)", async ({ page, duel, browser }, info) => {
    test.skip(info.project.name !== "phone-375", "one landscape run is enough");
    const roomId = await practiceRoomId(page, duel);
    // The watcher is its own context: give it this describe's landscape window, not the project's.
    const { ctx, page: spec } = await newWatcher(browser, { ...info.project.use, viewport: { width: 812, height: 375 } });
    await spec.goto(`/watch/${encodeURIComponent(roomId)}`);
    await expect(spec.locator(".rail-hand-fan .card-tile")).toHaveCount(5, { timeout: 30_000 });
    await expect(spec.locator(".spec-far-cards .card-tile")).toHaveCount(5);
    const near = await boxes(spec, ".rail-hand-fan .card-tile");
    const far = await boxes(spec, ".spec-far-cards .card-tile");
    expectOnScreen([...near, ...far], 812, 375);
    // The far fan is above the near one, and neither touches a mat.
    expect(bottomOf(far)).toBeLessThanOrEqual(topOf(near));
    for (const mat of await boxes(spec, ".side-field")) {
      for (const card of [...near, ...far]) expect(intersects(card, mat)).toBe(false);
    }
    await spec.screenshot({ path: info.outputPath("fans-landscape.png") });
    await ctx.close();
    expect(duel.errors).toEqual([]);
  });
});

/** The label pill's look: every style that could make the two pills differ. */
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

async function labelBox(page: Page, scope: string): Promise<Box> {
  return (await page.locator(`${scope} .hand-label`).first().boundingBox())!;
}

const NEAR_LABEL = ":is(.hand-fan, .rail-hand-fan, .hand-rail-head-spec)";
const FAR_LABEL = ".spec-far";

test("the two desktop hand labels match and line up, and each fan is draggable by its grip, at 1280x720 and 1440x900 (#346)", async ({ page, duel, browser }, info) => {
  test.skip(info.project.name !== "desktop-1280", "desktop layout (the sizes are set here)");
  const roomId = await practiceRoomId(page, duel);
  for (const size of [
    { width: 1280, height: 720 },
    { width: 1440, height: 900 },
  ]) {
      const { ctx, page: spec } = await newWatcher(browser, { ...info.project.use, viewport: size });
      await spec.goto(`/watch/${encodeURIComponent(roomId)}`);
      await expect(spec.locator(".hand-fan-cards .card-tile")).toHaveCount(5, { timeout: 30_000 });
      await expect(spec.locator(".spec-far-cards .card-tile")).toHaveCount(5);

      // One pill: same text styles, same colour for the count, in both labels.
      expect(await labelStyle(spec, NEAR_LABEL)).toEqual(await labelStyle(spec, FAR_LABEL));
      // Same hand size, same x: the labels line up.
      const near = await labelBox(spec, NEAR_LABEL);
      const far = await labelBox(spec, FAR_LABEL);
      expect(Math.abs(near.x - far.x)).toBeLessThan(1);
      const board = (await spec.locator(".playmat").boundingBox())!;
      expect(near.x).toBeGreaterThanOrEqual(board.x);
      // Let the opening draw animation finish before the picture.
      await spec.waitForTimeout(1500);
      await spec.screenshot({ path: info.outputPath(`fans-desktop-${size.width}x${size.height}.png`) });

      // Default spots reserve their strips; both grips are there.
      const oppMat = () => spec.locator(".side-field.side-opp").boundingBox().then((b) => b!);
      const youMat = () => spec.locator(".side-field.side-you").boundingBox().then((b) => b!);
      const oppY0 = (await oppMat()).y;
      const oppH0 = (await oppMat()).height;
      const youH0 = (await youMat()).height;
      const farGrip = spec.locator(".spec-far .hand-fan-grip");
      const nearGrip = spec.locator(".hand-fan-spec .hand-fan-grip");
      await expect(farGrip).toHaveCount(1);
      await expect(nearGrip).toHaveCount(1);

      const drag = async (grip: import("@playwright/test").Locator, to: { x: number; y: number }) => {
        const b = (await grip.boundingBox())!;
        await spec.mouse.move(b.x + b.width / 2, b.y + b.height / 2);
        await spec.mouse.down();
        await spec.mouse.move(to.x, to.y, { steps: 12 });
        await spec.mouse.up();
      };

      // Far fan: drag it down into the board's right side. It floats fully shown and the board takes the strip back.
      await drag(farGrip, { x: size.width * 0.78, y: size.height * 0.5 });
      await expect(spec.locator(".spec-far.spec-far-float")).toHaveCount(1);
      const floating = await boxes(spec, ".spec-far-float .spec-far-cards .card-tile");
      expectOnScreen(floating, size.width, size.height);
      expect(floating).toHaveLength(5);
      // The board takes the far strip back: the mats grow into it.
      expect((await oppMat()).height).toBeGreaterThan(oppH0 + 10);
      const saved = await spec.evaluate(() => JSON.parse(localStorage.getItem("optcg-duel:settings") ?? "{}") as Record<string, unknown>);
      expect(saved.spectatorFarFanPos).toMatch(/^[\d.]+,[\d.]+$/);
      expect(saved.handFanPos ?? "").toBe("");
      // The labels are the same pill wherever the fans are.
      expect(await labelStyle(spec, ".spec-far")).toEqual(await labelStyle(spec, ".hand-fan"));
      await spec.screenshot({ path: info.outputPath(`fans-desktop-${size.width}x${size.height}-far-moved.png`) });

      // Near fan: drag it up into the board's left side, off the bottom edge.
      await drag(nearGrip, { x: size.width * 0.3, y: size.height * 0.6 });
      await expect(spec.locator(".hand-fan.hand-fan-float")).toHaveCount(1);
      expectOnScreen(await boxes(spec, ".hand-fan-cards .card-tile"), size.width, size.height);
      // Both strips are reclaimed: the mats grow into them.
      expect((await youMat()).height).toBeGreaterThan(youH0 + 10);
      await expect.poll(async () => (await spec.evaluate(() => JSON.parse(localStorage.getItem("optcg-duel:settings") ?? "{}") as Record<string, string>)).spectatorNearFanPos).toMatch(/^[\d.]+,[\d.]+$/);
      if (size.width === 1440) await spec.screenshot({ path: info.outputPath("fans-desktop-1440x900-dragged.png") });

      // Dragging each back to its own default spot puts the strips back.
      const board2 = (await spec.locator(".playmat").boundingBox())!;
      const farBox = (await spec.locator(".spec-far-float").boundingBox())!;
      await drag(spec.locator(".spec-far .hand-fan-grip"), {
        x: board2.x + board2.width / 2 - farBox.width / 2 + 14 + 10,
        y: board2.y + 6 + 15,
      });
      await expect(spec.locator(".spec-far.spec-far-float")).toHaveCount(0);
      await expect.poll(async () => Math.abs((await oppMat()).y - oppY0)).toBeLessThan(2);
      await ctx.close();
  }
  expect(duel.errors).toEqual([]);
});

test("both phone layouts label the two hands with the same pill, lined up (#346)", async ({ page, duel, browser }, info) => {
  test.skip(info.project.name !== "phone-375", "phone layout");
  const roomId = await practiceRoomId(page, duel);
  // Portrait: both labels centred over their strips.
  const { ctx, page: spec } = await newWatcher(browser, info.project.use);
  await spec.goto(`/watch/${encodeURIComponent(roomId)}`);
  await expect(spec.locator(".hand-row-fan .card-tile")).toHaveCount(5, { timeout: 30_000 });
  await expect(spec.locator(".spec-far-cards .card-tile")).toHaveCount(5);
  expect(await labelStyle(spec, NEAR_LABEL)).toEqual(await labelStyle(spec, FAR_LABEL));
  const nearP = await labelBox(spec, NEAR_LABEL);
  const farP = await labelBox(spec, FAR_LABEL);
  expect(Math.abs(nearP.x + nearP.width / 2 - (farP.x + farP.width / 2))).toBeLessThan(1);
  expect(Math.abs(nearP.x + nearP.width / 2 - 375 / 2)).toBeLessThan(2);
  // The far label clears the Chat button and the Battle log pill beside it.
  for (const pill of [spec.getByRole("button", { name: "Chat" }), spec.locator(".battle-log")]) {
    expect(intersects(farP, (await pill.first().boundingBox())!)).toBe(false);
  }
  await spec.waitForTimeout(1500);
  await spec.screenshot({ path: info.outputPath("fans-phone-375x812.png") });
  await ctx.close();

  // Landscape: both left-aligned in the right column.
  const land = await newWatcher(browser, { ...info.project.use, viewport: { width: 812, height: 375 } });
  await land.page.goto(`/watch/${encodeURIComponent(roomId)}`);
  await expect(land.page.locator(".rail-hand-fan .card-tile")).toHaveCount(5, { timeout: 30_000 });
  expect(await labelStyle(land.page, NEAR_LABEL)).toEqual(await labelStyle(land.page, FAR_LABEL));
  const nearL = await labelBox(land.page, NEAR_LABEL);
  const farL = await labelBox(land.page, FAR_LABEL);
  expect(Math.abs(nearL.x - farL.x)).toBeLessThan(1);
  await land.page.waitForTimeout(1500);
  await land.page.screenshot({ path: info.outputPath("fans-phone-812x375.png") });
  await land.ctx.close();
  expect(duel.errors).toEqual([]);
});

// —— Spectators' fans mirror the players' own hand order (#346) ——

const HAND_CARDS = ":is(.rail-hand-cards, .hand-row-inner, .hand-fan-cards, .hand-dock-cards) > .card-tile";
const motionIds = (page: Page) => page.locator(HAND_CARDS).evaluateAll((els) => els.map((e) => e.getAttribute("data-motion-id")));
/** A card tile's name line ("Nico Robin"), the same on a player's tile and a spectator's. */
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
    // The fanned hand: its cards are all fully on screen to drag.
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
  // Two real online players in a private room (practice is hotseat and sends no hand order).
  const host = await newPlayer(browser, info.project.use, 21, "host");
  const created = host.page.waitForResponse((r) => /\/matchmake\/create\//.test(r.url()));
  await host.page.route("http://127.0.0.1:2567/matchmake/create/**", (route) => {
    const body = JSON.parse(route.request().postData() ?? "{}");
    return route.continue({ postData: JSON.stringify({ ...body, seed: 7 }) });
  });
  await host.page.goto("/");
  await host.page.getByRole("button", { name: "Play", exact: true }).click();
  await host.page.getByRole("button", { name: /^Private room/ }).click();
  await host.page.getByRole("button", { name: "Create room" }).click();
  const body = (await (await created).json()) as { roomId?: string; room?: { roomId?: string } };
  const roomId = (body.room?.roomId ?? body.roomId)!;
  await expect(host.page.locator(".room-invite-id")).toHaveText(roomId);

  const guest = await newPlayer(browser, info.project.use, 22, "guest");
  await guest.page.goto(`/?join=${encodeURIComponent(roomId)}`);
  await guest.page.getByRole("button", { name: "Join room" }).click();

  // The spectator's own Sort setting is on: it must not re-sort what it is shown.
  const watch = await newWatcher(browser, info.project.use);
  await watch.page.addInitScript(() => localStorage.setItem("optcg-duel:settings", JSON.stringify({ sortHandByCost: true })));
  await watch.page.goto(`/watch/${encodeURIComponent(roomId)}`);
  const phone = (info.project.use.viewport?.width ?? 1280) < 720;
  const specNear = phone ? ".hand-row-fan .card-tile" : ".hand-fan-cards .card-tile";
  await expect(watch.page.locator(specNear)).toHaveCount(5, { timeout: 30_000 });
  await expect(watch.page.locator(".spec-far-cards .card-tile")).toHaveCount(5);
  await expect(host.page.locator(HAND_CARDS)).toHaveCount(5, { timeout: 30_000 });
  await expect(guest.page.locator(HAND_CARDS)).toHaveCount(5, { timeout: 30_000 });

  // The spectator watches seat 0's camera: near = seat 0's hand, far = seat 1's. Which player is which seat is the server's call.
  const players = [host.page, guest.page];
  const nearIds = () => watch.page.locator(specNear).evaluateAll((els) => els.map((e) => e.getAttribute("data-motion-id")));
  const farNames = () => tileNames(watch.page, ".spec-far-cards .card-tile");
  let nearPlayer = players[0]!;
  let farPlayer = players[1]!;
  if (JSON.stringify(await motionIds(guest.page)) === JSON.stringify(await nearIds())) [nearPlayer, farPlayer] = [guest.page, host.page];
  await expect.poll(nearIds).toEqual(await motionIds(nearPlayer));
  const click = async (page: Page) =>
    page.locator(".hand-rail-btn", { hasText: "Sort" }).locator("visible=true").first().click();

  // Sort the near player's hand: the spectator's near fan reorders to match, ids and all.
  const unsortedNear = await motionIds(nearPlayer);
  await click(nearPlayer);
  await expect.poll(() => motionIds(nearPlayer)).not.toEqual(unsortedNear);
  const sortedNear = await motionIds(nearPlayer);
  await expect.poll(nearIds, { timeout: 10_000 }).toEqual(sortedNear);
  await watch.page.screenshot({ path: info.outputPath("hand-order-near-sorted.png") });

  // Sort the far player's hand: the far fan follows (compared by card name, the far tiles carry no ids).
  const unsortedFar = await tileNames(farPlayer, HAND_CARDS);
  expect(await farNames()).toEqual(unsortedFar);
  await click(farPlayer);
  await expect.poll(() => tileNames(farPlayer, HAND_CARDS)).not.toEqual(unsortedFar);
  const sortedFar = await tileNames(farPlayer, HAND_CARDS);
  await expect.poll(farNames, { timeout: 10_000 }).toEqual(sortedFar);

  // Unsort the near hand and drag its last card (the one nothing overlaps) to the second spot:
  // the spectator sees the dragged order, not the sort.
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
