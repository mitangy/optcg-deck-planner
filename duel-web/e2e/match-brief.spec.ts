/**
 * The Log Pose matchup brief on a practice board, clicked through the real UI against a real game server.
 *
 * The game server mints the brief ticket for real. The two Log Pose services are faked in the browser: the
 * planner API's chat session (Log Pose on, with a token) and the analyst's /brief stream, whose answers this
 * spec controls (a peek finds nothing saved; "Get brief" streams two text events and a citation, and is held
 * until the spec lets it finish, so the board can be measured while the brief is writing).
 *
 * What it proves: the card offers a brief and writes one without moving the board or the Brief button, it
 * stays clear of the playmat and hand, it folds away when the first turn starts, and "Ask Log Pose" opens the
 * Log Pose panel.
 */
import { test, expect, mintGameToken, FAKE_API, type Page } from "./fixtures";

const ANALYST = "http://127.0.0.1:8766";
const PAGE_ORIGIN = process.env.E2E_PAGE_ORIGIN ?? "http://127.0.0.1:5174";
const CORS = {
  "access-control-allow-origin": PAGE_ORIGIN,
  "access-control-allow-credentials": "true",
  "access-control-allow-headers": "authorization, content-type",
  "access-control-allow-methods": "POST, OPTIONS",
};

const sse = (events: [string, unknown][]) => events.map(([e, d]) => `event: ${e}\ndata: ${JSON.stringify(d)}\n\n`).join("");

async function stubLogPose(page: Page) {
  const requests: { ticket: string; generate: boolean }[] = [];
  let release: () => void = () => {};
  const held = new Promise<void>((resolve) => {
    release = resolve;
  });
  await page.route(`${FAKE_API}/analyst/chat/session`, (route) =>
    route.fulfill({
      status: 200,
      headers: CORS,
      json: { enabled: true, token: "chat.1.9999999999.x", expires_at: new Date(Date.now() + 3600_000).toISOString(), chat_url: ANALYST },
    }),
  );
  await page.route(`${ANALYST}/**`, async (route) => {
    const req = route.request();
    if (req.method() === "OPTIONS") return route.fulfill({ status: 204, headers: CORS });
    const body = JSON.parse(req.postData() ?? "{}") as { ticket: string; generate: boolean };
    requests.push(body);
    const headers = { ...CORS, "content-type": "text/event-stream" };
    if (!body.generate) return route.fulfill({ status: 200, headers, body: sse([["done", { cached: false }]]) });
    await held;
    return route.fulfill({
      status: 200,
      headers,
      body: sse([
        ["text", { delta: "**Game plan** Curve out and keep DON!! up." }],
        ["cite", { citations: [{ source: "playbook:ST01-001", title: "Playbook", cited_text: "Curve out." }] }],
        ["text", { delta: "\n**Numbers** Too few games." }],
        ["done", { cached: false, cost_usd: 0.1, saved: true }],
      ]),
    });
  });
  return { requests, release };
}

type Box = { x: number; y: number; width: number; height: number };
const round = (b: Box | null) => (b ? { x: Math.round(b.x), y: Math.round(b.y), width: Math.round(b.width), height: Math.round(b.height) } : null);

async function expectNoSidewaysScroll(page: Page) {
  const wide = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  expect(wide).toBeLessThanOrEqual(0);
}

async function checkBrief(page: Page, duel: { startPractice: (o: { seed: number }) => Promise<void> }, landscape: boolean, shot: string) {
  const logPose = await stubLogPose(page);
  await duel.startPractice({ seed: 11 });

  const trigger = page.getByRole("button", { name: "Matchup brief", exact: true });
  const card = page.locator(landscape ? ".match-brief-lp" : ".match-brief");
  const playmat = page.locator(".playmat");
  await expect(trigger).toBeVisible();

  // It opens by itself during the mulligan and offers a brief (nothing is saved, and "auto" is off).
  await expect(card).toBeVisible();
  await expect(card.getByRole("button", { name: "Get brief" })).toBeVisible();
  expect(logPose.requests.every((r) => r.generate === false)).toBe(true);
  await expectNoSidewaysScroll(page);

  // Where it sits: over the right column on desktop, clear of the hand on a phone.
  const rect = round(await card.boundingBox());
  if (!landscape) {
    const colEl = page.locator('[data-panel-col="right"]');
    const col = (await colEl.count()) > 0 ? await colEl.boundingBox() : null;
    if (col) {
      expect(rect!.x).toBeGreaterThanOrEqual(Math.floor(col.x) - 1);
      expect(rect!.x + rect!.width).toBeLessThanOrEqual(Math.ceil(col.x + col.width) + 1);
    } else {
      const hand = await page.locator(".hand-row").first().boundingBox();
      expect(hand).not.toBeNull();
      expect(rect!.y + rect!.height).toBeLessThanOrEqual(Math.ceil(hand!.y) + 1);
    }
  }
  await page.screenshot({ path: test.info().outputPath(`${shot}-offer.png`) });

  // Close it with ×; the board and the button have not moved.
  const closed = async () => {
    if (landscape) await page.keyboard.press("Escape");
    else await card.getByRole("button", { name: "Close matchup brief" }).click();
    await expect(card).toHaveCount(0);
  };
  await closed();
  const mat0 = round(await playmat.boundingBox());
  const trig0 = round(await trigger.boundingBox());

  const stable = async (why: string) => {
    expect(round(await playmat.boundingBox()), `playmat ${why}`).toEqual(mat0);
    expect(round(await trigger.boundingBox()), `trigger ${why}`).toEqual(trig0);
    await expectNoSidewaysScroll(page);
  };

  // Open it again from the button, ask for a brief, and measure while it writes and when it is done.
  await trigger.click();
  await expect(card).toBeVisible();
  await stable("with the card open");
  await card.getByRole("button", { name: "Get brief" }).click();
  await expect(card.getByRole("status")).toContainText("Writing");
  await stable("while it writes");
  logPose.release();
  await expect(card).toContainText("Curve out and keep DON!! up.");
  await expect(card.getByRole("button", { name: "Get brief" })).toHaveCount(0);
  await stable("when it is done");
  expect(logPose.requests.filter((r) => r.generate)).toHaveLength(1);
  await page.screenshot({ path: test.info().outputPath(`${shot}-ready.png`) });

  // "Ask Log Pose" opens the Log Pose panel for this matchup.
  await card.getByRole("button", { name: "Ask Log Pose" }).click();
  await expect(page.getByRole("dialog", { name: /Log Pose/ })).toBeVisible();
  await page.screenshot({ path: test.info().outputPath(`${shot}-logpose.png`) });
  await page.getByRole("button", { name: "Close Log Pose" }).click();
  await expect(page.getByRole("dialog", { name: /Log Pose/ })).toHaveCount(0);

  // Opening hands kept: the card folds away with the mulligan, the button stays.
  if (!(await card.isVisible())) await trigger.click();
  await page.getByRole("button", { name: "Keep opening hand" }).click();
  await page.getByRole("button", { name: "Keep opening hand" }).click();
  await expect(page.locator(".board-root")).toHaveAttribute("data-phase", "main");
  await expect(card).toHaveCount(0);
  await expect(trigger).toBeVisible();
  await page.screenshot({ path: test.info().outputPath(`${shot}-turn1.png`) });
}

test("practice: the matchup brief offers, writes and opens Log Pose without moving the board (#401)", async ({ page, duel }, info) => {
  await checkBrief(page, duel, false, info.project.name);
});

test.describe("landscape phone", () => {
  test.use({ viewport: { width: 812, height: 375 }, hasTouch: true });

  test("practice: the matchup brief offers, writes and opens Log Pose without moving the board, in landscape (#401)", async ({ page, duel }, info) => {
    test.skip(info.project.name !== "desktop-1280", "one run is enough: the viewport is set here");
    await checkBrief(page, duel, true, "landscape");
  });
});

test("a spectator of a practice room gets no Brief button or card, even with Log Pose on (#401)", async ({ page, duel, browser }, info) => {
  await stubLogPose(page);
  const created = page.waitForResponse((r) => /\/matchmake\/create\//.test(r.url()));
  await duel.startPractice({ seed: 7 });
  const body = (await (await created).json()) as { roomId?: string; room?: { roomId?: string } };
  const roomId = body.room?.roomId ?? body.roomId;
  expect(roomId).toBeTruthy();
  // The player has a Brief button, so the room does mint tickets; the watcher must still get none.
  await expect(page.getByRole("button", { name: "Matchup brief", exact: true })).toBeVisible();

  const watcher = await browser.newContext({ ...info.project.use });
  const spec = await watcher.newPage();
  await stubLogPose(spec);
  await spec.route(`${FAKE_API}/duel/guest-token`, (route) =>
    route.fulfill({ json: { token: mintGameToken(99, "watcher"), expires_at: 0, user_id: 99, email: "watcher@e2e.test", rating: 1000, games_played: 0 } }),
  );
  await spec.route(`${FAKE_API}/health`, (route) => route.fulfill({ json: { ok: true } }));
  await spec.goto("/");
  await spec.getByRole("button", { name: "Play", exact: true }).click();
  await spec.getByRole("button", { name: /^Spectate/ }).click();
  await spec.getByLabel("Room id").fill(roomId!);
  await spec.getByRole("button", { name: "Watch", exact: true }).click();
  await expect(spec.locator(".board-root")).toBeVisible({ timeout: 30_000 });
  await expect(spec.locator(":is(.rail-hand-cards, .hand-row-inner, .hand-fan-cards, .hand-dock-cards) .card-tile")).toHaveCount(5, { timeout: 30_000 });
  // Nothing of the brief, and no Log Pose compass or panel on the board.
  await spec.waitForTimeout(500);
  await expect(spec.getByRole("button", { name: "Matchup brief" })).toHaveCount(0);
  await expect(spec.locator(".match-brief")).toHaveCount(0);
  await expect(spec.getByRole("button", { name: "Log Pose", exact: true })).toHaveCount(0);
  await watcher.close();
});
