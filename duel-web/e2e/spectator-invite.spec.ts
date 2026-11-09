/**
 * Inviting a friend who is spectating (#1199): the friends list offers Invite
 * to a friend who is watching a game, the invite shows over the spectator's
 * board, and Join leaves the watched game for the inviter's private room.
 */
import type { Browser, Page, TestInfo } from "@playwright/test";
import { test, expect, seedDecks, signInAs, FAKE_API, type FakeAccount } from "./fixtures";

/** A fresh account per test: the game server outlives tests and keeps a dropped seat for its owner for a while. */
let nextUid = 100_000 + Math.floor(Math.random() * 800_000) * 10;
const account = (name: string): FakeAccount => ({ uid: nextUid++, name });
const KEEP = "Keep opening hand";

async function newDevice(browser: Browser, info: TestInfo, who: FakeAccount, viewport: { width: number; height: number }) {
  const ctx = await browser.newContext({ ...info.project.use, viewport, hasTouch: info.project.use.hasTouch || viewport.height < 500 });
  const page = await ctx.newPage();
  await page.route(`${FAKE_API}/**`, (route) => route.fulfill({ status: 404, json: { detail: "not in e2e fake API" } }));
  await signInAs(page, who);
  await seedDecks(page);
  return { ctx, page };
}

/** Where a screenshot goes when SHOTS_DIR is set (PR evidence); otherwise nowhere. */
async function shot(page: Page, name: string): Promise<void> {
  const dir = process.env.SHOTS_DIR;
  if (!dir) return;
  const vp = page.viewportSize()!;
  await page.screenshot({ path: `${dir}/${vp.width}x${vp.height}-${name}.png` });
}

const roomIdOf = async (res: Promise<{ json(): Promise<unknown> }>) => {
  const body = (await (await res).json()) as { roomId?: string; room?: { roomId?: string } };
  return (body.room?.roomId ?? body.roomId)!;
};

for (const vp of [
  { width: 1280, height: 720 },
  { width: 1440, height: 900 },
  { width: 375, height: 812 },
  { width: 812, height: 375 },
]) {
  test(`a spectator gets a friend's invite over the board and Join takes the seat, ${vp.width}x${vp.height} (#1199)`, async ({ page, duel, browser }, info) => {
    test.skip(info.project.name !== "desktop-1280", "viewports are set by the test; one project is enough");
    // A match to watch.
    const practice = page.waitForResponse((r) => /\/matchmake\/create\//.test(r.url()));
    await duel.startPractice({ seed: 7 });
    const watchedRoom = await roomIdOf(practice);

    // The friend opens a private room to invite the spectator to.
    const NAMI = account("NamiNavigator");
    const host = await newDevice(browser, info, NAMI, vp);
    const created = host.page.waitForResponse((r) => /\/matchmake\/create\//.test(r.url()));
    await host.page.goto("/");
    await host.page.getByRole("button", { name: "Play", exact: true }).click();
    await host.page.getByRole("dialog").getByRole("button", { name: /^Private room/ }).click();
    await host.page.getByRole("button", { name: "Create room" }).click();
    const inviteRoom = await roomIdOf(created);

    // The spectator: signed in, watching; the API reports Nami's invite.
    const ME = account("Zoro");
    const spec = await newDevice(browser, info, ME, vp);
    let dismissed = false;
    await spec.page.route(`${FAKE_API}/friends**`, (route) => {
      const path = new URL(route.request().url()).pathname;
      if (path.startsWith("/friends/invites/") && route.request().method() === "DELETE") {
        dismissed = true;
        return route.fulfill({ json: { ok: true } });
      }
      if (path !== "/friends") return route.fallback();
      const invites = dismissed
        ? []
        : [{ id: 31, from_user_id: NAMI.uid, from_username: NAMI.name, room_id: inviteRoom, expires_at: Date.now() / 1000 + 600 }];
      return route.fulfill({ json: { friends: [], incoming: [], outgoing: [], invites } });
    });
    await spec.page.goto(`/watch/${watchedRoom}`);
    await expect(spec.page.locator(".board-root")).toBeVisible({ timeout: 30_000 });

    const card = spec.page.locator(".spectator-invites").getByRole("region", { name: "Game invite" });
    await expect(card).toContainText("NamiNavigator invited you", { timeout: 20_000 });
    await expect(card).toContainText("Leaves this game");
    // Fits the screen, no sideways scroll.
    const box = (await card.boundingBox())!;
    expect(box.x).toBeGreaterThanOrEqual(0);
    expect(box.x + box.width).toBeLessThanOrEqual(vp.width);
    expect(box.y).toBeGreaterThanOrEqual(0);
    expect(await spec.page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(vp.width);
    await shot(spec.page, "spectating-invite");

    // Join: leave the watched game and sit down in Nami's room.
    await card.getByRole("button", { name: "Join" }).click();
    await expect(spec.page.getByRole("button", { name: KEEP })).toBeVisible({ timeout: 30_000 });
    await expect(host.page.getByRole("button", { name: KEEP })).toBeVisible({ timeout: 30_000 });
    await expect(spec.page.locator(".spectator-invites")).toHaveCount(0);
    await shot(spec.page, "joined");

    await spec.ctx.close();
    await host.ctx.close();
  });
}

test("the friends list offers Invite to a friend who is watching a game (#1199)", async ({ page }, info) => {
  const ME = account("Zoro");
  await page.route(`${FAKE_API}/**`, (route) => route.fulfill({ status: 404, json: { detail: "not in e2e fake API" } }));
  await signInAs(page, ME);
  await seedDecks(page);
  await page.route(`${FAKE_API}/friends`, (route) =>
    route.fulfill({
      json: {
        friends: [{ user_id: 9, username: "NamiNavigator", status: "spectating", room_id: "r-watch", ranked: false }],
        incoming: [],
        outgoing: [],
        invites: [],
      },
    }),
  );
  await page.goto("/");
  const friends = page.getByRole("region", { name: "Friends" });
  await expect(friends).toContainText("Watching a game");
  await expect(friends.getByRole("button", { name: "Invite" })).toBeVisible();
  await friends.scrollIntoViewIfNeeded();
  await shot(page, `lobby-${info.project.name}`);
});
