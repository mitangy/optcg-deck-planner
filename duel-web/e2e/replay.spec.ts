import { readFileSync } from "node:fs";
import { test, expect, signInAs, FAKE_API } from "./fixtures";
import type { Page } from "@playwright/test";

type Recording = { match_id: string; your_seat: number; replay: { intents: { seat: number; intent: { type: string } }[] } } & Record<string, unknown>;
const GAME = JSON.parse(readFileSync(new URL("./data/replay-purple-red.json", import.meta.url), "utf8")) as Recording;

const entry = (id: string, ready: boolean) => ({
  match_id: id,
  created_at: new Date(Date.now() - 3_600_000).toISOString(),
  ranked: true,
  your_seat: 0,
  won: true,
  reason: "leader_battle_at_zero_life",
  turns: 14,
  your_leader_id: "OP14-060",
  opponent_leader_id: "OP01-001",
  opponent_name: "Nami",
  rating_before: 1000,
  rating_after: 1016,
  has_replay: true,
  replay_ready: ready,
});

async function setUp(page: Page, replayRoute: { status?: number; body?: unknown } = {}): Promise<string[]> {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await signInAs(page, { uid: 1, name: "Zoro Fan" });
  await page.route(`${FAKE_API}/duel/matches/me**`, (route) => {
    const path = new URL(route.request().url()).pathname;
    if (path === "/duel/matches/me") return route.fulfill({ json: { matches: [entry("m1", true), entry("m2", false)] } });
    if (path === "/duel/matches/me/m1/replay") {
      return route.fulfill({ status: replayRoute.status ?? 200, json: replayRoute.body ?? GAME });
    }
    return route.fallback();
  });
  return errors;
}

async function openFromHistory(page: Page): Promise<void> {
  await page.goto("/history");
  await page.getByRole("link", { name: /^Watch replay/ }).click();
  await expect(page).toHaveURL(/\/replay\/m1$/);
  await expect(page.getByRole("group", { name: "Replay controls" })).toBeVisible({ timeout: 30_000 });
}

const slider = (page: Page) => page.getByRole("slider", { name: "Position in the game" });
const stepNow = async (page: Page) => Number(await slider(page).inputValue());
const turnNow = async (page: Page) => Number(await page.locator(".board-root").getAttribute("data-turn"));
const FAR_CLASSES = ".opp-hand-face, .opp-fan-face, .opp-corner-face, .opp-compact-face";
const FAR_FACE_UP = `.card-tile:is(${FAR_CLASSES})`;
const FAR_FACE_DOWN = ".opp-hand-fan .card-back, .opp-hand-backs .card-back, .opp-hand-faces .card-back, .card-back.opp-corner-card, .card-back.opp-hand-face, .opp-compact .card-back";
const farUp = (page: Page) => page.locator(FAR_FACE_UP).filter({ visible: true });
const farDown = (page: Page) => page.locator(FAR_FACE_DOWN).filter({ visible: true });
const line = (page: Page) => page.getByRole("group", { name: "Your line" });
const endTurn = (page: Page) => page.getByRole("button", { name: /^End turn/i });

test("History offers Watch only on games that can be watched, and it opens the board at the first step (#476)", async ({ page }) => {
  const errors = await setUp(page);
  await page.goto("/history");
  await expect(page.getByRole("link", { name: /^Watch replay/ })).toHaveCount(1);
  const widths = await page.locator(".history-item > .history-row-link").evaluateAll((els) => els.map((e) => Math.round(e.getBoundingClientRect().width)));
  expect(widths).toHaveLength(2);
  expect(widths[0]).toBe(widths[1]);
  await openFromHistory(page);
  expect(await stepNow(page)).toBe(0);
  await expect(page.locator(".board-root")).toBeVisible();
  await expect(endTurn(page)).toBeVisible();
  await expect(page.getByRole("button", { name: /^Copy/ })).toHaveCount(0);
  await expect(page.getByRole("button", { name: /concede/i })).toHaveCount(0);
  expect(errors).toEqual([]);
});

test("stepping moves the log, next turn moves the turn, and the keys do the same (#476)", async ({ page }) => {
  await setUp(page);
  await openFromHistory(page);
  const count = page.locator(".battle-log-count").first();
  const turn0 = await turnNow(page);
  await expect(count).toHaveText("0");

  await page.getByRole("button", { name: "Step forward" }).click();
  await page.getByRole("button", { name: "Step forward" }).click();
  await page.getByRole("button", { name: "Step forward" }).click();
  expect(await stepNow(page)).toBe(3);
  await expect.poll(async () => Number(await count.textContent())).toBeGreaterThan(0);

  await page.getByRole("button", { name: "Next turn" }).click();
  await expect.poll(() => turnNow(page)).toBeGreaterThan(turn0);
  const next = await turnNow(page);
  await page.getByRole("button", { name: "Previous turn" }).click();
  await expect.poll(() => turnNow(page)).toBeLessThan(next);

  await page.locator(".board-root").click({ position: { x: 4, y: 200 } });
  const before = await stepNow(page);
  await page.keyboard.press("ArrowRight");
  await expect.poll(() => stepNow(page)).toBe(before + 1);
  await page.keyboard.press("ArrowLeft");
  await expect.poll(() => stepNow(page)).toBe(before);
});

test("at the last step the result lives inside the controls on a phone and shows both hands (#476)", async ({ page }, info) => {
  test.skip(info.project.name !== "phone-375", "the floating pill is a phone-layout concern");
  await setUp(page);
  await openFromHistory(page);
  await page.getByRole("button", { name: "Next turn" }).click();
  const max = await slider(page).getAttribute("max");
  await slider(page).evaluate((el, v) => {
    const set = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!;
    set.call(el, String(v));
    el.dispatchEvent(new Event("input", { bubbles: true }));
  }, Number(max));
  const show = page.getByRole("button", { name: "Show result" });
  await expect(show).toBeVisible();
  await expect(page.locator(".match-result-pill")).toHaveCount(0);
  const group = await page.getByRole("group", { name: "Replay controls" }).boundingBox();
  const btn = await show.boundingBox();
  expect(btn!.y).toBeGreaterThanOrEqual(group!.y);
  expect(btn!.y + btn!.height).toBeLessThanOrEqual(group!.y + group!.height);
  await page.getByRole("button", { name: "What I saw" }).click();
  await expect(farDown(page)).toHaveCount(0);
  await expect(farUp(page).first()).toBeVisible();
});

test("Play advances by itself and Pause stops it (#476)", async ({ page }) => {
  await setUp(page);
  await openFromHistory(page);
  await page.getByRole("button", { name: "Play", exact: true }).click();
  await expect.poll(() => stepNow(page), { timeout: 8_000 }).toBeGreaterThan(0);
  await page.getByRole("button", { name: "Pause", exact: true }).click();
  const paused = await stepNow(page);
  await page.waitForTimeout(1_500);
  expect(await stepNow(page)).toBe(paused);
});

test("the replay opens with the opponent's hand face up (#488)", async ({ page }) => {
  await setUp(page);
  await openFromHistory(page);
  await page.getByRole("button", { name: "Step forward" }).click();
  await expect(farUp(page).first()).toBeVisible();
  await expect(farDown(page)).toHaveCount(0);
});

test("What I saw keeps the far hand face down; Reveal all turns it face up (#476)", async ({ page }) => {
  await setUp(page);
  await openFromHistory(page);
  await page.getByRole("button", { name: "Step forward" }).click();
  await page.getByRole("button", { name: "What I saw" }).click();

  await expect(farDown(page).first()).toBeVisible();
  await expect(farUp(page)).toHaveCount(0);
  const near = page.locator(":is(.rail-hand-cards, .hand-row-inner, .hand-fan-cards, .hand-dock-cards) .card-tile:not(.card-tile-hidden)");
  await expect(near.first()).toBeVisible();

  await page.getByRole("button", { name: "Reveal all" }).click();
  await expect(farUp(page).first()).toBeVisible();
  await expect(farDown(page)).toHaveCount(0);

  await page.getByRole("button", { name: "What I saw" }).click();
  await expect(farUp(page)).toHaveCount(0);
});

test("the board follows the seat to act, and that seat's hand is the one in hand (#966)", async ({ page }) => {
  await setUp(page);
  await openFromHistory(page);
  const board = page.locator(".board-root");
  await expect(board).toHaveAttribute("data-seat", "0");
  await page.getByRole("button", { name: "What I saw" }).click();
  await page.getByRole("button", { name: "Next turn" }).click();
  await expect(board).toHaveAttribute("data-seat", "1");
  await expect(farUp(page).first()).toBeVisible();
  await expect(farDown(page)).toHaveCount(0);
  await page.getByRole("button", { name: "Previous turn" }).click();
  await expect(board).toHaveAttribute("data-seat", "0");
});

test("playing the move that was played just goes on; a different one opens your own line (#966)", async ({ page }) => {
  const errors = await setUp(page);
  await openFromHistory(page);
  const board = page.locator(".board-root");
  await page.getByRole("button", { name: "Step forward" }).click();
  expect(await stepNow(page)).toBe(1);
  await endTurn(page).click();
  await expect.poll(() => stepNow(page)).toBe(2);
  await expect(line(page)).toHaveCount(0);

  await slider(page).fill("0");
  expect(await stepNow(page)).toBe(0);
  await expect(board).toHaveAttribute("data-turn", "1");
  await endTurn(page).click();
  await expect(line(page)).toBeVisible();
  await expect(line(page)).toContainText("Your line");
  await expect(line(page)).toContainText(/turn 1|T1/);
  await expect(line(page)).toContainText("1 move");
  await expect(board).toHaveAttribute("data-turn", "2");
  await expect(board).toHaveAttribute("data-seat", "1");
  expect(await stepNow(page)).toBe(0);
  await expect(page.locator(".battle-log-count").first()).not.toHaveText("0");

  await page.getByRole("button", { name: "Undo move" }).click();
  await expect(line(page)).toHaveCount(0);
  await expect(board).toHaveAttribute("data-turn", "1");
  await expect(board).toHaveAttribute("data-seat", "0");
  expect(await stepNow(page)).toBe(0);
  expect(errors).toEqual([]);
});

test("Back to game and the main controls leave your line (#966)", async ({ page }) => {
  await setUp(page);
  await openFromHistory(page);
  const board = page.locator(".board-root");
  const play = page.getByRole("button", { name: "Play", exact: true });
  const before = await play.boundingBox();

  await endTurn(page).click();
  await expect(line(page)).toBeVisible();
  expect(await play.boundingBox()).toEqual(before);
  await endTurn(page).click();
  await expect(line(page)).toContainText("2 moves");
  await page.getByRole("button", { name: "Back to game" }).click();
  await expect(line(page)).toHaveCount(0);
  expect(await stepNow(page)).toBe(0);
  await expect(board).toHaveAttribute("data-turn", "1");

  await endTurn(page).click();
  await expect(line(page)).toBeVisible();
  await page.getByRole("button", { name: "Step forward" }).click();
  await expect(line(page)).toHaveCount(0);
  expect(await stepNow(page)).toBe(1);
  await expect(board).toHaveAttribute("data-turn", "1");
});

test("a move pauses playback (#966)", async ({ page }) => {
  await setUp(page);
  await openFromHistory(page);
  await page.getByRole("button", { name: "Play", exact: true }).click();
  await expect.poll(() => stepNow(page), { timeout: 8_000 }).toBeGreaterThan(0);
  await endTurn(page).click();
  await expect(page.getByRole("button", { name: "Play", exact: true })).toBeVisible();
  const at = await stepNow(page);
  await page.waitForTimeout(1_500);
  expect(await stepNow(page)).toBe(at);
});

test("a recording that diverges at intent 0 shows Replay unavailable with a link to the match log (#476)", async ({ page }) => {
  const broken = structuredClone(GAME);
  const first = broken.replay.intents[0]!;
  broken.replay.intents[0] = { seat: 1 - first.seat, intent: { type: "end_turn" } };
  await setUp(page, { body: broken });
  await page.goto("/replay/m1");
  await expect(page.getByRole("heading", { name: "Replay unavailable" })).toBeVisible({ timeout: 30_000 });
  await expect(page.getByRole("link", { name: "Read the match log" })).toHaveAttribute("href", "/history/m1");
  await expect(page.getByRole("group", { name: "Replay controls" })).toHaveCount(0);
});

test("a game still being played says so and links the log (#476)", async ({ page }) => {
  await setUp(page, { status: 409, body: { detail: "This game is still being played" } });
  await page.goto("/replay/m1");
  await expect(page.getByRole("heading", { name: "Still being played" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Read the match log" })).toHaveAttribute("href", "/history/m1");
});

test.describe("landscape phone", () => {
  test.use({ viewport: { width: 812, height: 375 }, hasTouch: true });

  test("the controls sit fully inside an 812x375 screen and nothing scrolls sideways (#476)", async ({ page }, info) => {
    test.skip(info.project.name !== "phone-375", "one run is enough: the viewport is set here");
    await setUp(page);
    await openFromHistory(page);
    const box = await page.getByRole("group", { name: "Replay controls" }).boundingBox();
    expect(box).not.toBeNull();
    const vp = page.viewportSize()!;
    expect(box!.x).toBeGreaterThanOrEqual(0);
    expect(box!.y).toBeGreaterThanOrEqual(0);
    expect(box!.x + box!.width).toBeLessThanOrEqual(vp.width);
    expect(box!.y + box!.height).toBeLessThanOrEqual(vp.height);
    for (const name of ["Previous turn", "Step back", "Play", "Step forward", "Next turn", "What I saw", "Reveal all", "More replay options"]) {
      const b = await page.getByRole("button", { name, exact: true }).boundingBox();
      expect(b, name).not.toBeNull();
      expect(b!.y + b!.height, name).toBeLessThanOrEqual(vp.height);
      expect(b!.x + b!.width, name).toBeLessThanOrEqual(vp.width);
    }
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    const clipped = await page.locator(".replay-seg-btn").evaluateAll((els) => els.filter((e) => e.scrollWidth > e.clientWidth).map((e) => e.textContent));
    expect(clipped).toEqual([]);
    const hand = await page.locator(".rail-hand-cards .card-tile, .hand-fan-cards .card-tile, .rail-hand-spec .card-tile").first().boundingBox();
    expect(hand).not.toBeNull();
    expect(hand!.y + hand!.height).toBeLessThanOrEqual(box!.y + 1);
    await page.screenshot({ path: info.outputPath("replay-landscape.png") });
  });
});

test("a replay never answers an attack for you, even with response stops on auto (#966)", async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem("optcg-duel:settings", JSON.stringify({ responseStops: "auto" })));
  await setUp(page);
  await openFromHistory(page);
  // Step 15 is an attack waiting for the defender's block; passing it is the only choice, which "auto" would do by itself.
  await slider(page).fill("15");
  expect(await stepNow(page)).toBe(15);
  await expect(page.locator(".board-root")).toHaveAttribute("data-phase", "block");
  await page.waitForTimeout(4_000);
  expect(await stepNow(page)).toBe(15);
  await expect(line(page)).toHaveCount(0);
});

test.describe("game review (#967)", () => {
  test.setTimeout(150_000);
  const reviewBtn = (page: Page) => page.getByRole("button", { name: "Game review", exact: true });
  const strip = (page: Page) => page.locator(".replay-review");
  const grade = (page: Page) => strip(page).locator("svg.rv-badge[role=img]");

  async function openReview(page: Page): Promise<void> {
    await setUp(page);
    await openFromHistory(page);
    await expect(strip(page)).toBeVisible();
    await reviewBtn(page).click();
    await expect(page.getByText("Grades are bot-simulation estimates.")).toBeVisible({ timeout: 100_000 });
  }

  test("a mistake or blunder moment jumps to the move, badges it and offers the best move as your line (#967)", async ({ page }) => {
    const errors: string[] = [];
    page.on("pageerror", (e) => errors.push(e.message));
    await openReview(page);
    await expect(page.getByRole("heading", { name: "Key moments" })).toBeVisible();
    await expect(page.locator(".rv-tick-mistake, .rv-tick-blunder").first()).toBeAttached();
    const bad = page.locator(".rv-moment").filter({ has: page.locator(".rv-ink-mistake, .rv-ink-blunder") }).first();
    await expect(bad).toBeVisible();
    await bad.click();
    if (page.viewportSize()!.width < 900) await expect(page.getByRole("dialog", { name: "Game review" })).toHaveCount(0);
    expect(await stepNow(page)).toBeGreaterThan(0);
    await expect(grade(page)).toHaveAttribute("aria-label", /^(Mistake|Blunder)$/);
    if (page.viewportSize()!.width >= 900) await expect(strip(page).locator(".rv-alt-text")).toContainText("Best:");
    else await expect(page.getByRole("button", { name: "Show best move" })).toHaveAttribute("title", /^Play .+ from here$/);
    await expect(line(page)).toHaveCount(0);
    const before = await stepNow(page);
    await page.getByRole("button", { name: "Show best move" }).click();
    await expect(line(page)).toContainText("Your line");
    expect(await stepNow(page)).toBe(before - 1);
    await expect(strip(page)).toContainText("not graded");
    expect(errors).toEqual([]);
  });

  const uncut = (page: Page, selector: string) =>
    page.locator(selector).evaluateAll((els) =>
      els.map((el) => {
        const cs = getComputedStyle(el);
        return { text: (el.textContent ?? "").trim(), ellipsis: cs.textOverflow === "ellipsis" && cs.whiteSpace === "nowrap", wide: el.scrollWidth > el.clientWidth + 1, tall: el.scrollHeight > el.clientHeight + 1 };
      }),
    );
  const popup = (page: Page) => page.getByRole("dialog", { name: "Game review" });

  test("the desktop panel drags by its header, resizes from its edges, stays usable beside the board and is where it was left (#986)", async ({ page }) => {
    test.skip(page.viewportSize()!.width < 900, "the floating panel is desktop-only; phones get a sheet");
    const errors: string[] = [];
    page.on("pageerror", (e) => errors.push(e.message));
    await setUp(page);
    await openFromHistory(page);
    const controls = page.getByRole("group", { name: "Replay controls" });
    const dockBefore = (await controls.boundingBox())!;
    await reviewBtn(page).click();
    await expect(page.getByText("Grades are bot-simulation estimates.")).toBeVisible({ timeout: 100_000 });
    const box = async () => (await popup(page).boundingBox())!;
    const first = await box();
    expect(await controls.boundingBox()).toEqual(dockBefore);

    const head = (await popup(page).locator(".rv-summary-head").boundingBox())!;
    const grab = { x: head.x + head.width / 2, y: head.y + head.height / 2 };
    await page.mouse.move(grab.x, grab.y);
    await page.mouse.down();
    await page.mouse.move(grab.x - 150, grab.y + 20, { steps: 4 });
    await page.mouse.move(grab.x - 300, grab.y + 40, { steps: 4 });
    await page.mouse.up();
    const moved = await box();
    expect(Math.abs(moved.x - (first.x - 300))).toBeLessThanOrEqual(1);
    expect(Math.abs(moved.y - (first.y + 40))).toBeLessThanOrEqual(1);
    expect(moved.width).toBe(first.width);
    expect(await controls.boundingBox()).toEqual(dockBefore);

    const edge = async (name: string) => (await popup(page).locator(`[data-edge="${name}"]`).boundingBox())!;
    let e = await edge("left");
    await page.mouse.move(e.x + e.width / 2, e.y + e.height / 2);
    await page.mouse.down();
    await page.mouse.move(e.x + e.width / 2 - 60, e.y + e.height / 2, { steps: 4 });
    await page.mouse.up();
    const wider = await box();
    expect(Math.abs(wider.width - (moved.width + 60))).toBeLessThanOrEqual(1);
    expect(Math.abs(wider.x + wider.width - (moved.x + moved.width))).toBeLessThanOrEqual(1);
    e = await edge("bottom-right");
    await page.mouse.move(e.x + e.width / 2, e.y + e.height / 2);
    await page.mouse.down();
    await page.mouse.move(e.x + e.width / 2 + 40, e.y + e.height / 2 - 80, { steps: 4 });
    await page.mouse.up();
    const sized = await box();
    expect(Math.abs(sized.width - (wider.width + 40))).toBeLessThanOrEqual(1);
    expect(Math.abs(sized.height - (wider.height - 80))).toBeLessThanOrEqual(1);
    expect(sized.x).toBe(wider.x);
    await popup(page).locator('[data-edge="right"]').focus();
    await page.keyboard.press("ArrowRight");
    expect(Math.abs((await box()).width - (sized.width + 16))).toBeLessThanOrEqual(1);
    await popup(page).locator('[data-edge="right"]').press("ArrowLeft");

    const before = await stepNow(page);
    await page.getByRole("button", { name: "Step forward" }).click();
    expect(await stepNow(page)).toBe(before + 1);
    await expect(popup(page)).toBeVisible();

    const placed = await box();
    await page.reload();
    await expect(controls).toBeVisible({ timeout: 30_000 });
    await reviewBtn(page).click();
    await expect(popup(page)).toBeVisible();
    expect(await box()).toEqual(placed);

    const grip = (await popup(page).locator(".rv-summary-head").boundingBox())!;
    await page.mouse.move(grip.x + grip.width / 2, grip.y + grip.height / 2);
    await page.mouse.down();
    await page.mouse.move(grip.x + grip.width / 2 + 900, grip.y + grip.height / 2 + 600, { steps: 4 });
    await page.mouse.up();
    const corner = await box();
    expect(corner.x + corner.width).toBeGreaterThan(1000);
    await page.setViewportSize({ width: 1000, height: 600 });
    const small = await box();
    expect(small.x).toBeGreaterThanOrEqual(0);
    expect(small.y).toBeGreaterThanOrEqual(0);
    expect(small.x + small.width).toBeLessThanOrEqual(1000);
    expect(small.y + small.height).toBeLessThanOrEqual(600);
    await page.setViewportSize({ width: 1280, height: 720 });
    expect(await box()).toEqual(corner);

    const h2 = (await popup(page).locator(".rv-summary-head").boundingBox())!;
    await page.mouse.dblclick(h2.x + h2.width / 2, h2.y + h2.height / 2);
    expect(await box()).toEqual(first);
    await page.keyboard.press("Escape");
    await expect(popup(page)).toHaveCount(0);
    await expect(reviewBtn(page)).toBeFocused();
    expect(errors).toEqual([]);
  });

  test("long key moments and the bar's grade and best move wrap instead of being cut off (#986)", async ({ page }) => {
    const desktop = page.viewportSize()!.width >= 900;
    await openReview(page);
    const moments = page.locator(".rv-moment-sub");
    await expect(moments.first()).toBeVisible();
    expect(await uncut(page, ".rv-moment-sub, .rv-moment-top")).toEqual(expect.not.arrayContaining([expect.objectContaining({ ellipsis: true })]));
    expect((await uncut(page, ".rv-moment-sub, .rv-moment-top")).filter((r) => r.wide)).toEqual([]);
    if (desktop) {
      const left = (await popup(page).locator('[data-edge="left"]').boundingBox())!;
      await page.mouse.move(left.x + left.width / 2, left.y + left.height / 2);
      await page.mouse.down();
      await page.mouse.move(left.x + left.width / 2 + 400, left.y + left.height / 2, { steps: 4 });
      await page.mouse.up();
      expect((await popup(page).boundingBox())!.width).toBeLessThan(300);
    }
    const rows = await page.locator(".rv-moment-sub").evaluateAll((els) =>
      els.map((el) => {
        const cs = getComputedStyle(el);
        return { text: el.textContent ?? "", lines: Math.round(el.getBoundingClientRect().height / parseFloat(cs.lineHeight)), wide: el.scrollWidth > el.clientWidth + 1, ellipsis: cs.textOverflow === "ellipsis" };
      }),
    );
    const best = rows.filter((r) => r.text.includes("→ best:"));
    expect(best.length).toBeGreaterThan(0);
    expect(rows.every((r) => !r.wide && !r.ellipsis)).toBe(true);
    expect(Math.max(...best.map((r) => r.lines))).toBeGreaterThanOrEqual(2);
  });

  test("the bar's grade and Best line are whole on desktop and the controls under it never move; phones read them in the sheet (#986)", async ({ page }) => {
    const desktop = page.viewportSize()!.width >= 900;
    await openReview(page);
    const transport = page.locator(".replay-transport");
    const rest = (await transport.boundingBox())!;
    const stripRest = (await strip(page).boundingBox())!;
    const ticks = await page.locator(".rv-moment").filter({ has: page.locator(".rv-ink-mistake, .rv-ink-blunder") }).count();
    expect(ticks).toBeGreaterThan(0);
    for (let i = 0; i < Math.min(ticks, 3); i += 1) {
      if (!(await popup(page).count()) && !(await page.getByRole("heading", { name: "Key moments" }).count())) await reviewBtn(page).click();
      await page.locator(".rv-moment").filter({ has: page.locator(".rv-ink-mistake, .rv-ink-blunder") }).nth(i).click();
      expect(await transport.boundingBox()).toEqual(rest);
      expect(await strip(page).boundingBox()).toEqual(stripRest);
      if (desktop) {
        const bar = await uncut(page, ".rv-label, .rv-alt-text");
        expect(bar.length).toBeGreaterThan(0);
        expect(bar.filter((r) => r.ellipsis || r.wide || r.tall)).toEqual([]);
      } else {
        await reviewBtn(page).click();
        const now = page.locator(".rv-now");
        await expect(now).toContainText("Best:");
        await expect(now.locator(".rv-now-line").first()).toHaveText(/\S/);
        expect((await uncut(page, ".rv-now-line")).filter((r) => r.wide)).toEqual([]);
        await page.getByRole("button", { name: "Close" }).click();
      }
    }
  });

  for (const [label, size] of [["portrait", { width: 375, height: 812 }], ["landscape", { width: 812, height: 375 }]] as const) {
    test(`a pick open at a step never covers the review or transport buttons, ${label} (#1095)`, async ({ page }, info) => {
      await page.setViewportSize(size);
      await setUp(page);
      await openFromHistory(page);
      await slider(page).fill("14");
      expect(await stepNow(page)).toBe(14);
      await expect(page.locator(".field-bar")).toBeVisible();
      for (const name of ["Game review", "Previous turn", "Step back", "Play", "Step forward", "Next turn"]) {
        const btn = page.getByRole("button", { name, exact: true });
        if (!(await btn.count())) {
          expect(label === "landscape" && name === "Game review", `${name} is missing`).toBe(true);
          continue;
        }
        const hit = await btn.evaluate((el) => {
          const r = el.getBoundingClientRect();
          const top = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
          return !!top && el.contains(top);
        });
        expect(hit, `${name} is under the pick bar`).toBe(true);
      }
      await page.screenshot({ path: info.outputPath(`pick-over-replay-${label}.png`) });
      if (await reviewBtn(page).count()) {
        await reviewBtn(page).click();
        await expect(reviewBtn(page)).toHaveAttribute("aria-expanded", "true");
      }
    });
  }

  test("the strip keeps its place while grades arrive and when stepping (#967)", async ({ page }) => {
    await setUp(page);
    await openFromHistory(page);
    const box = async () => (await strip(page).boundingBox())!;
    const first = await box();
    await slider(page).fill("6");
    const later = await box();
    expect(later.height).toBe(first.height);
    expect(later.y).toBe(first.y);
    await expect(page.getByText("Reviewing", { exact: false }).first()).toBeVisible();
    const done = page.getByText(/Win chance|You \d+%/).first();
    await expect(done).toBeVisible({ timeout: 100_000 });
    await expect(strip(page).locator(".rv-eval-text")).toContainText(/You \d+% \(est\.\)/, { timeout: 100_000 });
    const end = await box();
    expect(end.height).toBe(first.height);
    expect(end.y).toBe(first.y);
  });
});
