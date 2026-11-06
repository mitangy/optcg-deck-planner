/**
 * Spectating an unranked room: the spectator sees both players' hands face up
 * (#250). A practice room is unranked, so a second browser watches it by id.
 */
import { test, expect, mintGameToken, FAKE_API, keepBothHands } from "./fixtures";

const NEAR_HAND = ":is(.rail-hand-cards, .hand-row-inner, .hand-fan:not(.hand-fan-top) .hand-fan-cards, .hand-dock-cards) .card-tile";
// A spectator's far hand is a mirrored hand fan along the top of the board (#346, #1007); phones get a grid, hidden hands the strip / rail fan.
const FAR_HAND = ":is(.hand-fan-top .hand-fan-cards .card-tile, .spec-far-cards .card-tile, .opp-fan-face, .opp-hand-face) >> visible=true";

test("a spectator of an unranked room sees both hands face up (#250)", async ({ page, duel, browser }, info) => {
  const created = page.waitForResponse((r) => /\/matchmake\/create\//.test(r.url()));
  await duel.startPractice({ seed: 7 });
  const body = (await (await created).json()) as { roomId?: string; room?: { roomId?: string } };
  const roomId = body.room?.roomId ?? body.roomId;
  expect(roomId).toBeTruthy();

  const watcher = await browser.newContext({ ...info.project.use });
  const spec = await watcher.newPage();
  await spec.route(`${FAKE_API}/**`, (route) => {
    const path = new URL(route.request().url()).pathname;
    if (path === "/health") return route.fulfill({ json: { ok: true } });
    if (path === "/duel/guest-token") {
      return route.fulfill({
        json: { token: mintGameToken(99, "watcher"), expires_at: 0, user_id: 99, email: "watcher@e2e.test", rating: 1000, games_played: 0 },
      });
    }
    return route.fulfill({ status: 404, json: { detail: "not in e2e fake API" } });
  });
  await spec.goto("/");
  await spec.getByRole("button", { name: "Play", exact: true }).click();
  await spec.getByRole("dialog").getByRole("button", { name: /^Spectate/ }).click();
  await spec.getByLabel("Room id").fill(roomId!);
  await spec.getByRole("button", { name: "Watch", exact: true }).click();

  // Both opening hands (5 cards each), face up: card tiles, not backs.
  await expect(spec.locator(NEAR_HAND)).toHaveCount(5, { timeout: 30_000 });
  await expect(spec.locator(FAR_HAND)).toHaveCount(5);
  await expect(spec.locator(".hand-back")).toHaveCount(0);
  await spec.screenshot({ path: info.outputPath("spectator.png") });
  await watcher.close();
  expect(duel.errors).toEqual([]);
});

test("a phone spectator sees both hands as compact grids and wider mats (#512)", async ({ page, duel, browser }, info) => {
  test.skip(info.project.name !== "phone-375", "phone layout");
  const created = page.waitForResponse((r) => /\/matchmake\/create\//.test(r.url()));
  await duel.startPractice({ seed: 7 });
  const body = (await (await created).json()) as { roomId?: string; room?: { roomId?: string } };
  const roomId = body.room?.roomId ?? body.roomId;
  expect(roomId).toBeTruthy();

  const watcher = await browser.newContext({ ...info.project.use });
  const spec = await watcher.newPage();
  await spec.route(`${FAKE_API}/**`, (route) => {
    const path = new URL(route.request().url()).pathname;
    if (path === "/health") return route.fulfill({ json: { ok: true } });
    if (path === "/duel/guest-token") {
      return route.fulfill({
        json: { token: mintGameToken(99, "watcher"), expires_at: 0, user_id: 99, email: "watcher@e2e.test", rating: 1000, games_played: 0 },
      });
    }
    return route.fulfill({ status: 404, json: { detail: "not in e2e fake API" } });
  });
  await spec.goto(`/watch/${roomId}`);
  await expect(spec.locator(NEAR_HAND)).toHaveCount(5, { timeout: 30_000 });
  await expect(spec.locator(FAR_HAND)).toHaveCount(5);

  // Each hand is one row of upright cards side by side: nothing overlaps, nothing sits lower than its neighbours.
  const expectGridRow = async (selector: string) => {
    const boxes = await spec.locator(selector).evaluateAll((els) =>
      els.map((el) => {
        const r = el.getBoundingClientRect();
        return { left: r.left, right: r.right, top: r.top, width: r.width, height: r.height };
      }),
    );
    expect(boxes).toHaveLength(5);
    boxes.forEach((b, i) => {
      expect(b.width).toBeLessThanOrEqual(60);
      expect(Math.abs(b.top - boxes[0]!.top)).toBeLessThan(1);
      expect(Math.abs(b.height / b.width - 1.4)).toBeLessThan(0.05);
      if (i > 0) expect(b.left).toBeGreaterThanOrEqual(boxes[i - 1]!.right - 0.5);
    });
  };
  await expectGridRow(".spec-far-cards .card-tile");
  await expectGridRow(".hand-row-inner .card-tile");

  // The rows are slim, so the mats fill the width (the two fans left them about 80% of it) and no bounty strip sits above.
  const vw = spec.viewportSize()!.width;
  for (const mat of await spec.locator(".side-field").all()) {
    expect((await mat.boundingBox())!.width).toBeGreaterThanOrEqual(vw * 0.9);
  }
  await expect(spec.locator(".rating-chip")).toHaveCount(0);
  await expect(spec.locator(".intent-bar")).toHaveCount(0);

  // Landscape: the right column holds both grids and the mats get the two-row layout of Bigger playing area.
  await spec.setViewportSize({ width: 812, height: 375 });
  await expect(spec.locator(".arena.arena-lp.arena-big")).toHaveCount(1);
  const columns = await spec.locator(".side-grid").first().evaluate((el) => getComputedStyle(el).gridTemplateColumns.split(" ").length);
  expect(columns).toBe(8);
  await expect(spec.locator(".rating-chip")).toHaveCount(0);
  await expect(spec.locator(NEAR_HAND)).toHaveCount(5);
  await expect(spec.locator(FAR_HAND)).toHaveCount(5);
  await watcher.close();
  expect(duel.errors).toEqual([]);
});

test("spectator fans use the match hand fan: same card size, overlap, tuck and rise (#1007)", async ({ page, duel, browser }, info) => {
  test.skip(info.project.name !== "desktop-1280", "desktop layout");
  const created = page.waitForResponse((r) => /\/matchmake\/create\//.test(r.url()));
  // The player's own hand is a fan; `preferFan` would be wiped by startPractice, so the setting goes in as storage.
  await duel.startPractice({ seed: 7, storage: { "optcg-duel:settings": JSON.stringify({ handLayout: "fan" }) } });
  const body = (await (await created).json()) as { roomId?: string; room?: { roomId?: string } };
  const roomId = body.room?.roomId ?? body.roomId;
  expect(roomId).toBeTruthy();
  await keepBothHands(page);
  await expect(page.locator(".hand-fan-cards .card-tile")).toHaveCount(5);
  await page.waitForTimeout(1500);
  const matchCard = (await page.locator(".hand-fan-cards .card-tile").nth(2).boundingBox())!;

  const watcher = await browser.newContext({ ...info.project.use });
  const spec = await watcher.newPage();
  await spec.route(`${FAKE_API}/**`, (route) => {
    const path = new URL(route.request().url()).pathname;
    if (path === "/health") return route.fulfill({ json: { ok: true } });
    if (path === "/duel/guest-token") {
      return route.fulfill({
        json: { token: mintGameToken(99, "watcher"), expires_at: 0, user_id: 99, email: "watcher@e2e.test", rating: 1000, games_played: 0 },
      });
    }
    return route.fulfill({ status: 404, json: { detail: "not in e2e fake API" } });
  });
  await spec.goto(`/watch/${roomId}`);
  const near = spec.locator(".hand-fan:not(.hand-fan-top) .hand-fan-cards .card-tile");
  const far = spec.locator(".hand-fan-top .hand-fan-cards .card-tile");
  await expect(near).toHaveCount(5, { timeout: 30_000 });
  await expect(far).toHaveCount(5);
  await spec.waitForTimeout(1500);
  const boxes = async (l: typeof near) => Promise.all((await l.all()).map(async (c) => (await c.boundingBox())!));

  // Same card size as the player's own fan in the match (the middle card, which is not tilted).
  for (const hand of [await boxes(near), await boxes(far)]) {
    expect(Math.abs(hand[2]!.width - matchCard.width)).toBeLessThanOrEqual(1);
    // Overlapping, not side by side: each card starts before the previous one ends.
    hand.slice(1).forEach((b, i) => expect(b.x).toBeLessThan(hand[i]!.x + hand[i]!.width - 4));
  }

  // The far fan is tucked: most of each card is above the board, only a strip of the bottoms peeks in.
  const board = (await spec.locator(".playmat").boundingBox())!;
  const tucked = (await boxes(far))[2]!;
  expect(tucked.y).toBeLessThan(board.y - tucked.height * 0.4);
  expect(tucked.y + tucked.height).toBeGreaterThan(board.y);
  expect(tucked.y + tucked.height).toBeLessThan(board.y + tucked.height * 0.45);

  // Pointing at a far card raises the fan onto the board.
  await spec.mouse.move(tucked.x + tucked.width / 2, tucked.y + tucked.height - 6);
  await expect.poll(async () => (await boxes(far))[2]!.y + tucked.height).toBeGreaterThan(tucked.y + tucked.height + tucked.height * 0.4);
  const raised = (await boxes(far))[2]!;
  expect(raised.y).toBeGreaterThanOrEqual(board.y - 1);
  await spec.mouse.move(spec.viewportSize()!.width / 2, spec.viewportSize()!.height / 2);
  await expect.poll(async () => (await boxes(far))[2]!.y).toBeCloseTo(tucked.y, -1);

  // The near fan tucks and rises the same way, and its Hand button pins it up.
  const tuckedNear = (await boxes(near))[2]!;
  await spec.mouse.move(tuckedNear.x + tuckedNear.width / 2, tuckedNear.y + 8);
  await expect.poll(async () => (await boxes(near))[2]!.y).toBeLessThan(tuckedNear.y - tuckedNear.height * 0.4);
  await spec.mouse.move(spec.viewportSize()!.width / 2, spec.viewportSize()!.height / 2);
  await expect.poll(async () => (await boxes(near))[2]!.y).toBeCloseTo(tuckedNear.y, -1);
  const toggle = spec.locator(".hand-fan:not(.hand-fan-top) .hand-fan-toggle");
  await toggle.click();
  await spec.mouse.move(spec.viewportSize()!.width / 2, spec.viewportSize()!.height / 2);
  await expect(toggle).toHaveAttribute("aria-expanded", "true");
  await expect.poll(async () => (await boxes(near))[2]!.y).toBeLessThan(tuckedNear.y - tuckedNear.height * 0.4);
  await watcher.close();
  expect(duel.errors).toEqual([]);
});
