/**
 * The Log Pose copilot on a practice board (#416), clicked through the real UI against a real game server.
 *
 * The game server mints the brief ticket for real. The two Log Pose services are faked in the browser: the planner
 * API's chat session (Log Pose on, with a token) and the analyst's /chat, which reads the game context the board
 * sends, checks it only holds what this seat can see, and answers with a short text and a Turn plan built from the
 * snapshot's own ids (give 1 DON!! to the Leader, attack the opposing Leader, end the turn). The answer is held until
 * the spec releases it, so the board can be measured while Log Pose is thinking.
 *
 * What it proves: the Log Pose button is there only with the setting on, on the desktop bar, the phone bar and the
 * landscape rail; the panel says it is looking at this game; the game context carries your hand and nothing of the
 * opponent's hand; the plan card sends nothing until Play this turn; the plan then plays out (DON!!, attack, end
 * turn) with a "step N of M" pill and Stop; Stop leaves the rest unsent; and none of it moves the board.
 */
import { test, expect, mintGameToken, FAKE_API, type Page, keepBothHands } from "./fixtures";

const ANALYST = "http://127.0.0.1:8766";
const PAGE_ORIGIN = process.env.E2E_PAGE_ORIGIN ?? "http://127.0.0.1:5174";
const SHOT_DIR = process.env.COPILOT_SHOTS ?? "";
const CORS = {
  "access-control-allow-origin": PAGE_ORIGIN,
  "access-control-allow-credentials": "true",
  "access-control-allow-headers": "authorization, content-type, accept",
  "access-control-allow-methods": "POST, OPTIONS",
};

const sse = (events: [string, unknown][]) => events.map(([e, d]) => `event: ${e}\ndata: ${JSON.stringify(d)}\n\n`).join("");

type Snap = {
  turn: number;
  yourTurn: boolean;
  you: { leader: { id: string }; hand: { id: string; defId: string }[] };
  opponent: { leader: { id: string }; hand: unknown };
  legal: { type: string; target?: string; attacker?: string }[];
  revealedHands?: unknown;
};
type ChatBody = { message?: string; context?: { page?: string; game?: { ticket: string; snapshot: Snap } } };

/**
 * Settings stored before the app loads. The fixture's own init script wipes localStorage once per session, so this also
 * re-applies the patch after a clear, whichever script runs first.
 */
async function setSettings(page: Page, patch: Record<string, unknown>) {
  await page.addInitScript((p) => {
    const key = "optcg-duel:settings";
    const apply = () => {
      const stored = JSON.parse(localStorage.getItem(key) ?? "{}") as Record<string, unknown>;
      localStorage.setItem(key, JSON.stringify({ ...stored, ...p }));
    };
    const clear = Storage.prototype.clear;
    Storage.prototype.clear = function (this: Storage) {
      clear.call(this);
      if (this === localStorage) apply();
    };
    apply();
  }, patch);
}

async function stubLogPose(page: Page) {
  const chats: ChatBody[] = [];
  let release: () => void = () => {};
  let held = new Promise<void>((resolve) => (release = resolve));
  await page.route(`${FAKE_API}/analyst/chat/session`, (route) =>
    route.fulfill({
      status: 200,
      headers: CORS,
      json: { enabled: true, token: "chat.1.9999999999.x", expires_at: new Date(Date.now() + 3600_000).toISOString(), chat_url: ANALYST },
    }),
  );
  await page.route(`${FAKE_API}/analyst/chat/threads/*`, (route) => route.fulfill({ status: 404, headers: CORS, json: {} }));
  await page.route(`${ANALYST}/**`, async (route) => {
    const req = route.request();
    if (req.method() === "OPTIONS") return route.fulfill({ status: 204, headers: CORS });
    const body = JSON.parse(req.postData() ?? "{}") as ChatBody;
    const headers = { ...CORS, "content-type": "text/event-stream" };
    // The matchup brief's own peek: nothing saved.
    if (new URL(req.url()).pathname !== "/chat") return route.fulfill({ status: 200, headers, body: sse([["done", { cached: false }]]) });
    chats.push(body);
    const snap = body.context?.game?.snapshot;
    await held;
    if (!snap) return route.fulfill({ status: 200, headers, body: sse([["text", { delta: "No game context." }], ["done", {}]]) });
    return route.fulfill({
      status: 200,
      headers,
      body: sse([
        ["thread", { thread_id: 1 }],
        ["text", { delta: "Give your Leader a DON!!, hit their Leader, then pass." }],
        [
          "plan",
          {
            id: "toolu_plan",
            turn: snap.turn,
            summary: "Pump the Leader and swing at their Leader.",
            steps: [
              { action: "give_don", target: snap.you.leader.id, count: 1, label: "Give 1 DON!! to your Leader" },
              { action: "attack", attacker: snap.you.leader.id, target: snap.opponent.leader.id, label: "Attack their Leader with your Leader" },
              { action: "end_turn", label: "End your turn" },
            ],
          },
        ],
        ["done", { thread_id: 1, cost_usd: 0.01, spent_today_usd: 0.01, daily_cap_usd: 3 }],
      ]),
    });
  });
  return {
    chats,
    release: () => release(),
    /** Hold the next answer again. */
    hold: () => {
      held = new Promise<void>((resolve) => (release = resolve));
    },
  };
}

/**
 * Slows what the browser sends to the game server (never what comes back), so a plan's steps can be watched one by
 * one: with a delay set, each message lands that long after it was sent. Order is kept, also across a delay change:
 * a message never goes out before one sent earlier, so dropping the delay to 0 can't let a click overtake a
 * delayed plan step (#445).
 */
async function slowGameServer(page: Page) {
  await page.addInitScript(() => {
    const w = window as unknown as { __sendDelay: number };
    w.__sendDelay = 0;
    let lastAt = 0;
    const send = WebSocket.prototype.send;
    WebSocket.prototype.send = function (this: WebSocket, data: Parameters<WebSocket["send"]>[0]) {
      const now = Date.now();
      const at = Math.max(now + w.__sendDelay, lastAt);
      lastAt = at;
      if (at > now) setTimeout(() => send.call(this, data), at - now);
      else send.call(this, data);
    };
  });
  return { setDelay: (ms: number) => page.evaluate((d) => ((window as unknown as { __sendDelay: number }).__sendDelay = d), ms) };
}

type Box = { x: number; y: number; width: number; height: number };
const round = (b: Box | null) => (b ? { x: Math.round(b.x), y: Math.round(b.y), width: Math.round(b.width), height: Math.round(b.height) } : null);
const overlaps = (a: Box, b: Box) => a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height;

async function expectNoSidewaysScroll(page: Page) {
  const wide = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  expect(wide).toBeLessThanOrEqual(0);
}

async function shot(page: Page, name: string) {
  if (SHOT_DIR) await page.screenshot({ path: `${SHOT_DIR}/${name}.png` });
}

async function endTurn(page: Page) {
  const end = page.locator(".intent-btn-primary", { hasText: /End turn/ });
  await end.click();
  // With the confirm-end-turn setting on, the same button asks for a second tap.
  const again = page.locator(".intent-btn-primary", { hasText: /(Tap|Click) again|End turn\?/ });
  if (await again.isVisible().catch(() => false)) await again.click();
}

/** Both mulligans kept, then each seat passes once: it is your (seat 0) turn 3, the first one that may attack. */
async function reachTurnThree(page: Page) {
  const root = page.locator(".board-root");
  await keepBothHands(page);
  await expect(root).toHaveAttribute("data-phase", "main");
  await endTurn(page);
  await expect(root).toHaveAttribute("data-turn", "2");
  await endTurn(page);
  await expect(root).toHaveAttribute("data-turn", "3");
  await expect(root).toHaveAttribute("data-seat", "0");
}

/** The Leader's power badge as read on the board: "5000" before a DON!!, "6000" with one on it. */
const leaderPower = async (page: Page) => ((await page.locator(".side-field.side-you .zone-leader .power-badge").first().innerText()) ?? "").replace(/\s+/g, " ").trim();

const panel = (page: Page) => page.getByRole("dialog", { name: /Log Pose/ });
const logPoseButton = (page: Page) => page.getByRole("button", { name: "Log Pose", exact: true });
const pill = (page: Page) => page.locator(".copilot-pill");

/** Ask for a plan: open the panel, tap the starter, hold while Log Pose "thinks", then let the plan arrive. */
async function askForPlan(page: Page, lp: Awaited<ReturnType<typeof stubLogPose>>, button: ReturnType<typeof logPoseButton>) {
  await button.click();
  await expect(panel(page)).toBeVisible();
  await expect(panel(page)).toContainText("Looking at: this game");
  for (const starter of ["What's my best play this turn?", "Plan my turn", "Should I block or counter?"]) {
    await expect(panel(page).getByRole("button", { name: starter })).toBeVisible();
  }
  await panel(page).getByRole("button", { name: "Plan my turn" }).click();
  await expect.poll(() => lp.chats.length).toBe(1);
  return lp;
}

function checkContext(body: ChatBody) {
  const game = body.context?.game;
  expect(game, "the chat request carries the game context").toBeTruthy();
  expect(game!.ticket).toMatch(/^mb1\./);
  const snap = game!.snapshot;
  expect(body.context?.page).toBe("duel-board");
  expect(snap.yourTurn).toBe(true);
  expect(snap.you.hand.length).toBeGreaterThan(0);
  // The opponent's hand is a count, never cards; the other seat's revealed hands are not in the request at all.
  expect(typeof snap.opponent.hand).toBe("number");
  expect(snap.revealedHands).toBeUndefined();
  expect(JSON.stringify(body)).not.toContain("revealedHands");
  expect(snap.legal.some((a) => a.type === "end_turn")).toBe(true);
}

async function checkCopilot(page: Page, duel: { startPractice: (o: { seed: number }) => Promise<void>; errors: string[] }, mode: "desktop" | "portrait" | "landscape", shotName: string) {
  await setSettings(page, { logPoseCopilot: true });
  const lp = await stubLogPose(page);
  const wire = await slowGameServer(page);
  await duel.startPractice({ seed: 7 });
  const button = logPoseButton(page);
  await expect(button).toBeVisible();
  // The label shows on the desktop bar; the phone bar and the rail carry the compass alone.
  if (mode === "desktop") await expect(button).toContainText("Log Pose");
  else await expect(button).not.toContainText("Log Pose");
  if (mode === "landscape") await expect(button).toHaveClass(/lp-rail-btn/);
  await reachTurnThree(page);
  await expectNoSidewaysScroll(page);
  if (mode !== "landscape") await expectTopBarFits(page);

  const hud = page.locator(".arena .hud-bar");
  const playmat = page.locator(".playmat");
  const bar0 = mode === "landscape" ? null : round(await hud.boundingBox());
  const button0 = round(await button.boundingBox());
  const mat0 = round(await playmat.boundingBox());
  const stable = async (why: string) => {
    expect(round(await button.boundingBox()), `Log Pose button ${why}`).toEqual(button0);
    if (bar0) expect(round(await hud.boundingBox()), `top bar ${why}`).toEqual(bar0);
    expect(round(await playmat.boundingBox()), `playmat ${why}`).toEqual(mat0);
    await expectNoSidewaysScroll(page);
  };

  const power0 = await leaderPower(page);
  expect(power0).toBe("5000");

  // Ask for a plan; the answer is held, so Log Pose is still thinking while the panel is measured.
  await askForPlan(page, lp, button);
  await stable("with the panel open");
  checkContext(lp.chats[0]!);
  lp.release();
  const card = panel(page).getByRole("region", { name: "Turn plan" });
  await expect(card).toBeVisible();
  for (const label of ["Give 1 DON!! to your Leader", "Attack their Leader with your Leader", "End your turn"]) await expect(card).toContainText(label);
  await expect(card.getByRole("button", { name: "Play this turn" })).toBeEnabled();
  await expect(card.getByRole("status")).toContainText("Nothing is played until you tap Play this turn");
  await card.scrollIntoViewIfNeeded();
  await shot(page, `${shotName}_plan`);

  // Nothing reaches the game before approval: the Leader has no DON!!, the turn is still turn 3.
  await page.waitForTimeout(600);
  expect(await leaderPower(page)).toBe(power0);
  await expect(page.locator(".board-root")).toHaveAttribute("data-turn", "3");
  await expect(pill(page)).toHaveCount(0);
  await stable("with the plan card shown");

  // Close the panel (the board stays put), then approve from the panel again.
  await page.getByRole("button", { name: "Close Log Pose" }).click();
  await expect(panel(page)).toHaveCount(0);
  await stable("with the panel closed");
  await button.click();
  await expect(panel(page)).toBeVisible();
  // From here every intent takes a moment to land, so the steps can be watched.
  // Long enough that the checks below finish before the next step lands, even on a busy runner (#445).
  await wire.setDelay(8000);
  await card.getByRole("button", { name: "Play this turn" }).click();
  await expect(pill(page)).toBeVisible();
  await expect(pill(page)).toContainText(/Log Pose · step \d of 3/);
  await expect(pill(page).getByRole("button", { name: "Stop" })).toBeVisible();
  await expect(card.getByRole("status")).toContainText(/Playing step \d of 3/);
  await expect(card.getByRole("button", { name: "Play this turn" })).toHaveCount(0);
  await expect(card.getByRole("button", { name: "Stop" })).toBeVisible();
  // The DON!! is on the Leader before the attack is sent.
  await expect.poll(() => leaderPower(page), { timeout: 20_000 }).toBe("6000");
  await expect(page.locator(".board-root")).toHaveAttribute("data-seat", "0");
  await expect(page.locator(".board-root")).toHaveAttribute("data-phase", "main");
  await stable("while the plan runs");
  await page.getByRole("button", { name: "Close Log Pose" }).click();
  await expect(panel(page)).toHaveCount(0);
  await expect(pill(page)).toBeVisible();
  await stable("with the panel closed and the pill up");
  await expectPillClear(page);
  await shot(page, `${shotName}_running`);
  await wire.setDelay(0);

  // The attack happens: the device passes to the defender (practice), who is asked to block / counter.
  await expect(page.locator(".board-root")).toHaveAttribute("data-seat", "1", { timeout: 15_000 });
  await finishOpponentDefence(page);
  // Back with the plan's seat: the attack landed and the plan ends the turn.
  await expect(page.locator(".board-root")).toHaveAttribute("data-turn", "4", { timeout: 20_000 });
  await expect(pill(page)).toHaveCount(0);
  // The attack landed: the defender (now on turn) lost a Life card to hand.
  const life = page.locator(".turn-player-you .turn-player-stats dt", { hasText: /^life$/i }).locator("xpath=following-sibling::dd[1]");
  if (await life.isVisible().catch(() => false)) await expect(life).toHaveText("4");
  expect(duel.errors).toEqual([]);
}

/** Everything in the top bar fits: the status (turn, whose turn) is not cut off by the buttons next to the Log Pose button. */
async function expectTopBarFits(page: Page) {
  const cut = await page.evaluate(() => {
    const bar = document.querySelector<HTMLElement>(".arena .hud-bar");
    if (!bar) return ["no top bar"];
    const out: string[] = [];
    const barBox = bar.getBoundingClientRect();
    for (const el of bar.querySelectorAll<HTMLElement>(".hud-status, .hud-status *")) {
      if (el.scrollWidth > el.clientWidth + 1 && getComputedStyle(el).textOverflow !== "ellipsis") out.push(`${el.className} is cut off (${el.scrollWidth} > ${el.clientWidth})`);
    }
    const status = bar.querySelector<HTMLElement>(".hud-status")?.getBoundingClientRect();
    const actions = bar.querySelector<HTMLElement>(".hud-actions")?.getBoundingClientRect();
    if (status && actions && status.right > actions.left + 1) out.push(`status runs under the buttons (${Math.round(status.right)} > ${Math.round(actions.left)})`);
    if (actions && actions.right > barBox.right + 1) out.push("buttons run past the bar");
    return out;
  });
  expect(cut, "top bar").toEqual([]);
}

/**
 * The desktop text buttons (Brief, Log Pose) hug their label with the same padding on both sides (#463): content
 * (text + icon) is at least 8px from each border, left and right within 2px, and nothing overflows the box.
 * Returns how many were measured so a caller can refuse a vacuous pass.
 */
async function expectTopBarButtonsPadded(page: Page) {
  const rows = await page.evaluate(() => {
    const out: { name: string; left: number; right: number; over: number }[] = [];
    for (const b of document.querySelectorAll<HTMLElement>(".arena .hud-bar .hud-brief-btn.hud-brief-text")) {
      const box = b.getBoundingClientRect();
      if (box.width === 0) continue;
      const rects: DOMRect[] = [];
      const walk = (n: Node) => {
        if (n.nodeType === Node.TEXT_NODE) {
          if (!n.textContent?.trim()) return;
          const r = document.createRange();
          r.selectNodeContents(n);
          rects.push(...Array.from(r.getClientRects()));
        } else if (n instanceof Element) {
          if (getComputedStyle(n).position === "absolute") return;
          if (n instanceof SVGElement && n.tagName.toLowerCase() === "svg") rects.push(n.getBoundingClientRect());
          else n.childNodes.forEach(walk);
        }
      };
      b.childNodes.forEach(walk);
      if (rects.length === 0) continue;
      const left = Math.min(...rects.map((r) => r.left));
      const right = Math.max(...rects.map((r) => r.right));
      out.push({ name: b.textContent?.trim() || b.getAttribute("aria-label") || b.className, left: left - box.left, right: box.right - right, over: b.scrollWidth - b.clientWidth });
    }
    return out;
  });
  expect(rows.length, "Brief and Log Pose both measured").toBeGreaterThanOrEqual(2);
  for (const r of rows) {
    expect(r.left, `${r.name} left gap`).toBeGreaterThanOrEqual(8);
    expect(r.right, `${r.name} right gap`).toBeGreaterThanOrEqual(8);
    expect(Math.abs(r.left - r.right), `${r.name} gap difference`).toBeLessThanOrEqual(2);
    expect(r.over, `${r.name} overflows its box`).toBeLessThanOrEqual(0);
  }
}

/** The pill floats over the board's top edge: it must clear the hand, the End turn control, the top bar and the rail. */
async function expectPillClear(page: Page) {
  const p = (await pill(page).boundingBox())!;
  expect(p).not.toBeNull();
  const vp = page.viewportSize()!;
  expect(p.x).toBeGreaterThanOrEqual(0);
  expect(p.x + p.width).toBeLessThanOrEqual(vp.width);
  expect(p.y + p.height).toBeLessThanOrEqual(vp.height);
  const others = page.locator(
    ":is(.hand-row-inner, .hand-fan-cards, .rail-hand-cards, .hand-dock-cards) .card-tile, .intent-btn-primary, .hud-bar button, .lp-rail button",
  );
  const n = await others.count();
  for (let i = 0; i < n; i++) {
    const el = others.nth(i);
    if (!(await el.isVisible())) continue;
    const b = await el.boundingBox();
    if (b && b.width > 0 && overlaps(p, b)) throw new Error(`the pill overlaps ${await el.evaluate((e) => `${e.tagName}.${e.className}`)} at ${JSON.stringify(round(b))} (pill ${JSON.stringify(round(p))})`);
  }
}

/**
 * The practice seat answers the attack: no block, no counter, then the Life check. A seat with nothing to block with
 * may be passed on by the board itself, so each button is clicked only if it is still on offer.
 */
async function finishOpponentDefence(page: Page) {
  const lifeCheck = page.getByRole("button", { name: /^(No Trigger|Add to hand)$/ });
  // The button that answers each battle step. Matching the step keeps a stale "Pass block" (still on screen as the
  // Counter step starts) from going out twice: the game refuses it, and a refused move stops the plan (#445).
  const answers: Record<string, RegExp> = { block: /^Pass block$/, counter: /^(Pass counter|Take hit)$/, damage: /^Resolve$/ };
  let answered: string | null = null;
  await expect
    .poll(
      async () => {
        if (await lifeCheck.isVisible().catch(() => false)) return true;
        const step = await page.locator(".board-root").getAttribute("data-phase");
        const label = step ? answers[step] : undefined;
        if (!label || step === answered) return false;
        const button = page.locator(".intent-btn-primary", { hasText: label }).first();
        if (await button.isVisible().catch(() => false)) {
          await button.click({ timeout: 2000 }).then(() => (answered = step)).catch(() => undefined);
        }
        return false;
      },
      { timeout: 30_000, intervals: [200] },
    )
    .toBe(true);
  await lifeCheck.click();
}

test("the Log Pose button is not on the board while the copilot setting is off (#416)", async ({ page, duel }) => {
  await stubLogPose(page);
  await duel.startPractice({ seed: 7 });
  await keepBothHands(page);
  await expect(page.locator(".board-root")).toHaveAttribute("data-phase", "main");
  // Brief is on by default, so the bar did render its buttons: only Log Pose's is missing.
  await expect(page.getByRole("button", { name: "Matchup brief", exact: true })).toBeVisible();
  await expect(logPoseButton(page)).toHaveCount(0);
  await expect(page.locator(".lp-rail-btn")).toHaveCount(0);
});

test("practice: Log Pose plans a turn, plays it only after approval, and moves nothing on the board (#416)", async ({ page, duel }, info) => {
  const phone = info.project.name === "phone-375";
  await checkCopilot(page, duel, phone ? "portrait" : "desktop", phone ? "phone_375x812_portrait" : "desktop_1280x720");
});

test.describe("landscape phone", () => {
  test.use({ viewport: { width: 812, height: 375 }, hasTouch: true });

  test("practice: the copilot plans and plays a turn from the landscape rail (#416)", async ({ page, duel }, info) => {
    test.skip(info.project.name !== "desktop-1280", "one run is enough: the viewport is set here");
    await checkCopilot(page, duel, "landscape", "phone_812x375_landscape");
  });
});

test.describe("desktop top bar padding", () => {
  for (const vp of [{ width: 1280, height: 720 }, { width: 1440, height: 900 }]) {
    test(`the Brief and Log Pose buttons keep even padding in the desktop top bar at ${vp.width}x${vp.height} (#463)`, async ({ page, duel }, info) => {
      test.skip(info.project.name !== "desktop-1280", "desktop only: the phone bar uses icon boxes");
      await page.setViewportSize(vp);
      await setSettings(page, { logPoseCopilot: true });
      await stubLogPose(page);
      await duel.startPractice({ seed: 7 });
      await expect(page.getByRole("button", { name: "Matchup brief", exact: true })).toBeVisible();
      await expect(logPoseButton(page)).toContainText("Log Pose");
      await expectTopBarButtonsPadded(page);
    });
  }
});

test("Stop on the pill leaves the rest of the plan unsent (#416)", async ({ page, duel }) => {
  await setSettings(page, { logPoseCopilot: true });
  const lp = await stubLogPose(page);
  const wire = await slowGameServer(page);
  await duel.startPractice({ seed: 7 });
  await reachTurnThree(page);
  const root = page.locator(".board-root");
  await askForPlan(page, lp, logPoseButton(page));
  lp.release();
  const card = panel(page).getByRole("region", { name: "Turn plan" });
  await expect(card).toBeVisible();

  // Long enough that closing the panel and tapping Stop beat the first step's answer on a busy runner; the attack
  // goes out as soon as that answer lands, so a short delay lets it slip past Stop (#445).
  await wire.setDelay(6000);
  await card.getByRole("button", { name: "Play this turn" }).click();
  await expect(pill(page)).toContainText(/step 1 of 3/);
  // A phone's panel covers the board and its pill: close it, then stop from the pill.
  await page.getByRole("button", { name: "Close Log Pose" }).click();
  await expect(panel(page)).toHaveCount(0);
  await pill(page).getByRole("button", { name: "Stop" }).click();
  await expect(pill(page)).toHaveCount(0);
  await logPoseButton(page).click();
  await expect(card.getByRole("status")).toContainText(/Stopped/);
  await expect(card.getByRole("button", { name: "Play this turn" })).toHaveCount(0);
  await expect(card.getByRole("button", { name: "Stop" })).toHaveCount(0);

  // The step that was already on its way lands (the Leader gets its DON!!); the attack and End turn are never sent.
  await expect.poll(() => leaderPower(page), { timeout: 20_000 }).toBe("6000");
  await page.waitForTimeout(4000);
  await expect(root).toHaveAttribute("data-turn", "3");
  await expect(root).toHaveAttribute("data-seat", "0");
  await expect(root).toHaveAttribute("data-phase", "main");
  expect(await leaderPower(page)).toBe("6000");
  await expect(page.locator(".intent-btn-primary", { hasText: /Pass block/ })).toHaveCount(0);
  expect(duel.errors).toEqual([]);
});

test("the Settings page has the Log Pose copilot switch, off until it is turned on (#416)", async ({ page }, info) => {
  await stubLogPose(page);
  await page.route(`${FAKE_API}/auth/me`, (route) =>
    route.fulfill({ status: 200, headers: CORS, json: { id: 1, email: "seat1@e2e.test", name: "Luffy", username: "Luffy" } }),
  );
  await page.goto("/settings");
  const copilot = page.getByRole("checkbox", { name: "Log Pose in casual and practice games" });
  await copilot.scrollIntoViewIfNeeded();
  await expect(copilot).not.toBeChecked();
  await copilot.check();
  await expect(copilot).toBeChecked();
  const stored = await page.evaluate(() => JSON.parse(localStorage.getItem("optcg-duel:settings") ?? "{}") as { logPoseCopilot?: boolean });
  expect(stored.logPoseCopilot).toBe(true);
  await expectNoSidewaysScroll(page);
  await shot(page, info.project.name === "phone-375" ? "settings_375" : "settings_1280");
});
