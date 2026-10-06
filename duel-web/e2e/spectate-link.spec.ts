/**
 * Spectate links (#346): `/watch/<room id>` opens straight into spectating, and
 * a bad or finished room says so back in the lobby.
 */
import type { BrowserContext, Page } from "@playwright/test";
import { test, expect, mintGameToken, FAKE_API } from "./fixtures";

const NEAR_HAND = ":is(.rail-hand-cards, .hand-row-inner, .hand-fan-cards, .hand-dock-cards) .card-tile";
const FAR_HAND = ":is(.opp-fan-face, .opp-hand-face) >> visible=true";
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
});
