/**
 * The Log Pose matchup brief on a practice board, clicked through the real UI against a real game server.
 *
 * The game server mints the brief ticket for real. The two Log Pose services are faked in the browser: the
 * planner API's chat session (Log Pose on, with a token) and the analyst's /brief stream, whose answers this
 * spec controls (a peek finds nothing saved; "Get brief" streams two text events and a citation, and is held
 * until the spec lets it finish, so the board can be measured while the brief is writing).
 *
 * What it proves: the brief lives at the top of the Log Pose panel (opened by the Brief button, or by itself
 * during the mulligan on a wide screen only), offers a brief and writes one without moving the board or the
 * Brief button, the panel is dragged by its header and resized from its corner on a wide screen and stays on
 * screen and remembered, and an untouched self-opened panel folds away when the first turn starts.
 */
import { test, expect, mintGameToken, FAKE_API, type Page, keepBothHands } from "./fixtures";

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

type Kind = "desktop" | "portrait" | "landscape";

/**
 * The panel has finished opening. It opens with a transform animation (it grows out of the compass, or slides in from
 * its edge), and a box measured before that ends is one frame of the animation, not where the panel sits: CI caught
 * the phone sheet's bottom edge at 813.4 in an 812px viewport while it was still sliding in. A settled panel is whole
 * pixels, so everything below is measured only once the panel has no animation left.
 */
async function popSettled(panel: ReturnType<Page["locator"]>) {
  await expect.poll(() => panel.evaluate((el) => el.getAnimations().length), { message: "the panel's open animation has finished" }).toBe(0);
}

/** The point at the middle of `box` belongs to `el` (nothing, such as a panel, sits on top of it). */
async function reachable(page: Page, el: ReturnType<Page["locator"]>) {
  const box = (await el.boundingBox())!;
  return el.evaluate(
    (node, p) => {
      const hit = document.elementFromPoint(p.x, p.y);
      return Boolean(hit && node.contains(hit));
    },
    { x: box.x + box.width / 2, y: box.y + box.height / 2 },
  );
}

async function checkBrief(page: Page, duel: { startPractice: (o: { seed: number }) => Promise<void> }, kind: Kind, shot: string) {
  const logPose = await stubLogPose(page);
  await duel.startPractice({ seed: 11 });

  const trigger = page.getByRole("button", { name: "Matchup brief", exact: true });
  const panel = page.getByRole("dialog", { name: /Log Pose/ });
  const brief = panel.locator(".match-brief-pinned");
  const playmat = page.locator(".playmat");
  const keep = page.getByRole("button", { name: "Keep opening hand" });
  await expect(trigger).toBeVisible();

  if (kind === "desktop") {
    // On a wide screen the panel opens by itself during the mulligan, without taking the keyboard or the board's buttons.
    await expect(panel).toBeVisible();
    await expect(brief.getByRole("button", { name: "Get brief" })).toBeVisible();
    await expect(page.getByLabel("Message Log Pose")).not.toBeFocused();
    expect(await reachable(page, keep)).toBe(true);
    await expect(trigger).toHaveAttribute("aria-expanded", "true");
  } else {
    // A phone's panel would cover Keep and Mulligan, so it waits for the Brief button.
    await expect(panel).toHaveCount(0);
    await expect(trigger).toHaveAttribute("aria-expanded", "false");
    await trigger.click();
    await expect(panel).toBeVisible();
    await expect(brief.getByRole("button", { name: "Get brief" })).toBeVisible();
  }
  expect(logPose.requests.every((r) => r.generate === false)).toBe(true);
  await expectNoSidewaysScroll(page);
  await page.screenshot({ path: test.info().outputPath(`${shot}-offer.png`) });

  // The brief is the first thing in the chat and the panel is on screen.
  const vp = page.viewportSize()!;
  const inside = (b: Box) => {
    expect(b.x).toBeGreaterThanOrEqual(0);
    expect(b.y).toBeGreaterThanOrEqual(0);
    expect(b.x + b.width).toBeLessThanOrEqual(vp.width + 1);
    expect(b.y + b.height).toBeLessThanOrEqual(vp.height + 1);
  };
  await popSettled(panel);
  inside((await panel.boundingBox())!);
  const briefBox = (await brief.boundingBox())!;
  const panelBox = (await panel.boundingBox())!;
  expect(briefBox.y).toBeLessThan(panelBox.y + 200);

  // Close the panel with its own button: the board and the Brief button have not moved.
  const closePanel = async () => {
    await panel.getByRole("button", { name: "Close Log Pose" }).click();
    await expect(panel).toHaveCount(0);
  };
  await closePanel();
  await expect(trigger).toHaveAttribute("aria-expanded", "false");
  const mat0 = round(await playmat.boundingBox());
  const trig0 = round(await trigger.boundingBox());
  const stable = async (why: string) => {
    expect(round(await playmat.boundingBox()), `playmat ${why}`).toEqual(mat0);
    expect(round(await trigger.boundingBox()), `trigger ${why}`).toEqual(trig0);
    await expectNoSidewaysScroll(page);
  };

  // Open it again from the button, ask for a brief, and measure while it writes and when it is done.
  await trigger.click();
  await expect(panel).toBeVisible();
  await expect(trigger).toHaveAttribute("aria-expanded", "true");
  await stable("with the panel open");
  await brief.getByRole("button", { name: "Get brief" }).click();
  await expect(brief.getByRole("status")).toContainText("Writing");
  await stable("while it writes");
  logPose.release();
  await expect(brief).toContainText("Curve out and keep DON!! up.");
  await expect(brief.getByRole("button", { name: "Get brief" })).toHaveCount(0);
  await stable("when it is done");
  expect(logPose.requests.filter((r) => r.generate)).toHaveLength(1);
  await page.screenshot({ path: test.info().outputPath(`${shot}-ready.png`) });

  // The brief folds down to its header row and back.
  const toggle = brief.getByRole("button", { name: /^Matchup brief/ });
  await expect(toggle).toHaveAttribute("aria-expanded", "true");
  await toggle.click();
  await expect(toggle).toHaveAttribute("aria-expanded", "false");
  await expect(brief).not.toContainText("Curve out and keep DON!! up.");
  await toggle.click();
  await expect(brief).toContainText("Curve out and keep DON!! up.");

  if (kind === "desktop") await moveAndResize(page, panel, stable, trigger, shot);

  // You can talk to Log Pose from here: the brief stays pinned above the messages.
  await panel.getByLabel("Message Log Pose").fill("Who goes first?");
  await expect(panel.getByRole("button", { name: "Send", exact: true })).toBeEnabled();
  await panel.getByLabel("Message Log Pose").fill("");
  await page.screenshot({ path: test.info().outputPath(`${shot}-logpose.png`) });

  // Opening hands kept: the panel is put away first on a phone, which it would cover.
  if (await panel.isVisible()) await closePanel();
  await keepBothHands(page);
  await expect(page.locator(".board-root")).toHaveAttribute("data-phase", "main");
  await expect(trigger).toBeVisible();
  await page.screenshot({ path: test.info().outputPath(`${shot}-turn1.png`) });
}

/** The Log Pose panel is resized from its corner, dragged by its header, stays on screen, moves nothing else and is remembered (#423). */
async function moveAndResize(page: Page, panel: ReturnType<Page["locator"]>, stable: (why: string) => Promise<void>, trigger: ReturnType<Page["locator"]>, shot: string) {
  const vp = page.viewportSize()!;
  const drag = async (el: ReturnType<Page["locator"]>, dx: number, dy: number) => {
    const b = (await el.boundingBox())!;
    const x = b.x + b.width / 2;
    const y = b.y + b.height / 2;
    await page.mouse.move(x, y);
    await page.mouse.down();
    await page.mouse.move(x + dx / 2, y + dy / 2, { steps: 4 });
    await page.mouse.move(x + dx, y + dy, { steps: 4 });
    await page.mouse.up();
  };
  const onScreen = (b: Box) => {
    expect(b.x).toBeGreaterThanOrEqual(0);
    expect(b.y).toBeGreaterThanOrEqual(0);
    expect(b.x + b.width).toBeLessThanOrEqual(vp.width + 1);
    expect(b.y + b.height).toBeLessThanOrEqual(vp.height + 1);
  };
  const near = (a: number, b: number, why: string, tol = 2) => expect(Math.abs(a - b), `${why}: ${a} vs ${b}`).toBeLessThanOrEqual(tol);

  // Shrink it from the top-left corner; the bottom-right corner stays where it was.
  await popSettled(panel);
  const start = (await panel.boundingBox())!;
  const handle = panel.locator(".lp-resize-corner");
  const dw = 60;
  const dh = 120;
  await drag(handle, dw, dh);
  const small = (await panel.boundingBox())!;
  near(start.width - small.width, dw, "narrower");
  near(start.height - small.height, dh, "shorter");
  near(small.x + small.width, start.x + start.width, "right edge stays");
  near(small.y + small.height, start.y + start.height, "bottom edge stays");
  onScreen(small);
  await stable("after resizing the panel");
  await page.screenshot({ path: test.info().outputPath(`${shot}-resized.png`) });

  // Drag it by its header: it follows the pointer, and stays inside the window.
  const mx = -Math.min(300, Math.round(small.x) - 20);
  const my = -80;
  await drag(panel.locator("#lp-title"), mx, my);
  const moved = (await panel.boundingBox())!;
  near(moved.x - small.x, mx, "moved x");
  near(moved.y - small.y, my, "moved y");
  near(moved.width, small.width, "moving keeps the width");
  near(moved.height, small.height, "moving keeps the height");
  onScreen(moved);
  await stable("after dragging the panel");
  await page.screenshot({ path: test.info().outputPath(`${shot}-moved.png`) });

  // The header's buttons still work, and pushing the panel past the edge stops at the edge.
  await drag(panel.locator("#lp-title"), 0, -5000);
  onScreen((await panel.boundingBox())!);
  // (Pulling it to the left or right edge docks it in the board's column instead, #432.)
  await drag(panel.locator("#lp-title"), 0, 5000);
  const corner = (await panel.boundingBox())!;
  onScreen(corner);
  near(corner.y + corner.height, vp.height, "stops at the bottom edge");
  await drag(panel.locator("#lp-title"), mx, my);
  const placed = (await panel.boundingBox())!;

  // Closed and opened again: it comes back where it was left.
  await panel.getByRole("button", { name: "Close Log Pose" }).click();
  await expect(panel).toHaveCount(0);
  await trigger.click();
  await expect(panel).toBeVisible();
  // The panel slides in for a moment: wait for it to settle before measuring.
  await expect.poll(async () => Math.abs((await panel.boundingBox())!.x - placed.x)).toBeLessThanOrEqual(1);
  await popSettled(panel);
  const kept = (await panel.boundingBox())!;
  for (const k of ["x", "y", "width", "height"] as const) near(kept[k], placed[k], `kept ${k}`, 1);
  await stable("after reopening the panel");

  // The arrow keys on the Move grip nudge it.
  await panel.getByRole("button", { name: "Move Log Pose" }).focus();
  await page.keyboard.press("ArrowLeft");
  const nudged = (await panel.boundingBox())!;
  near(kept.x - nudged.x, 16, "one arrow key is 16px");
  await page.keyboard.press("ArrowRight");

  // A double-click on the header puts it back in the corner (its size stays).
  const t = (await panel.locator("#lp-title").boundingBox())!;
  await page.mouse.dblclick(t.x + t.width / 2, t.y + t.height / 2);
  await expect.poll(async () => Math.round((await panel.boundingBox())!.x + (await panel.boundingBox())!.width)).toBe(vp.width);
  const reset = (await panel.boundingBox())!;
  near(reset.y + reset.height, vp.height, "reset to the bottom edge");
  near(reset.width, small.width, "reset keeps the size");
  await stable("after resetting the panel");
}

test("practice: the matchup brief offers, writes and opens Log Pose without moving the board (#401), pinned in the Log Pose panel that moves and resizes (#423)", async ({ page, duel }, info) => {
  await checkBrief(page, duel, (page.viewportSize()?.width ?? 0) > 600 ? "desktop" : "portrait", info.project.name);
});

test.describe("landscape phone", () => {
  test.use({ viewport: { width: 812, height: 375 }, hasTouch: true });

  test("practice: the matchup brief offers, writes and opens Log Pose without moving the board, in landscape (#401, #423)", async ({ page, duel }, info) => {
    test.skip(info.project.name !== "desktop-1280", "one run is enough: the viewport is set here");
    await checkBrief(page, duel, "landscape", "landscape");
  });
});

test("the panel that opened itself for the mulligan folds away when the first turn starts, if nobody touched it (#423)", async ({ page, duel }, info) => {
  test.skip(info.project.name !== "desktop-1280", "only a wide screen opens the panel by itself");
  await stubLogPose(page);
  await duel.startPractice({ seed: 11 });
  const panel = page.getByRole("dialog", { name: /Log Pose/ });
  await expect(panel).toBeVisible();
  await keepBothHands(page);
  await expect(page.locator(".board-root")).toHaveAttribute("data-phase", "main");
  await expect(panel).toHaveCount(0);
});

test("a panel the player opened or used stays open when the first turn starts (#423)", async ({ page, duel }, info) => {
  test.skip(info.project.name !== "desktop-1280", "only a wide screen opens the panel by itself");
  await stubLogPose(page);
  await duel.startPractice({ seed: 11 });
  const panel = page.getByRole("dialog", { name: /Log Pose/ });
  await expect(panel).toBeVisible();
  // Touching the panel (here, folding the brief) makes it the player's.
  await panel.getByRole("button", { name: /^Matchup brief/ }).click();
  await keepBothHands(page);
  await expect(page.locator(".board-root")).toHaveAttribute("data-phase", "main");
  // A panel that folds away shrinks into the compass for ~200ms before it goes (#432): look after that.
  await page.waitForTimeout(600);
  await expect(panel).toBeVisible();
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
  await spec.getByRole("dialog").getByRole("button", { name: /^Spectate/ }).click();
  await spec.getByLabel("Room id").fill(roomId!);
  await spec.getByRole("button", { name: "Watch", exact: true }).click();
  await expect(spec.locator(".board-root")).toBeVisible({ timeout: 30_000 });
  await expect(spec.locator(":is(.rail-hand-cards, .hand-row-inner, .hand-fan-cards, .hand-dock-cards) .card-tile")).toHaveCount(5, { timeout: 30_000 });
  // Nothing of the brief, and no Log Pose compass or panel on the board.
  await spec.waitForTimeout(500);
  await expect(spec.getByRole("button", { name: "Matchup brief" })).toHaveCount(0);
  await expect(spec.locator(".match-brief-pinned")).toHaveCount(0);
  await expect(spec.getByRole("button", { name: "Log Pose", exact: true })).toHaveCount(0);
  await watcher.close();
});
