/**
 * Watching a finished game again (#476): History's Watch button opens the recording on the board, read-only, with
 * step / turn / play controls, a "What I saw" / "Reveal all" switch and a flip. The FastAPI backend is faked in the
 * browser; the recording is a real golden game (e2e/data/replay-purple-red.json) that the page re-runs in the browser.
 */
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

/** Signed in, with a history of two games (only m1 can be watched) and `replayRoute` answering for m1's recording. */
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
  // The engine rebuilds the game in the browser first.
  await expect(page.getByRole("group", { name: "Replay controls" })).toBeVisible({ timeout: 30_000 });
}

const slider = (page: Page) => page.getByRole("slider", { name: "Position in the game" });
const stepNow = async (page: Page) => Number(await slider(page).inputValue());
const turnNow = async (page: Page) => Number(await page.locator(".board-root").getAttribute("data-turn"));
const FAR_FACE_UP = ".spec-far-cards .card-tile:not(.card-tile-hidden)";
const FAR_FACE_DOWN = ".spec-far-cards .card-tile-hidden";

test("History offers Watch only on games that can be watched, and it opens the board at the first step (#476)", async ({ page }) => {
  const errors = await setUp(page);
  await page.goto("/history");
  await expect(page.getByRole("link", { name: /^Watch replay/ })).toHaveCount(1);
  // A row without a recording keeps the Watch button's room, so every row ends at the same edge.
  const widths = await page.locator(".history-item > .history-row-link").evaluateAll((els) => els.map((e) => Math.round(e.getBoundingClientRect().width)));
  expect(widths).toHaveLength(2);
  expect(widths[0]).toBe(widths[1]);
  await openFromHistory(page);
  expect(await stepNow(page)).toBe(0);
  await expect(page.locator(".board-root")).toBeVisible();
  // Read-only: no action bar, no room link, no concede.
  await expect(page.getByRole("button", { name: /end turn/i })).toHaveCount(0);
  await expect(page.getByRole("button", { name: /^Copy/ })).toHaveCount(0);
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

  // Keys, with the focus on the board rather than a control.
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
  // Not a floating pill over the board: the button sits inside the controls group.
  await expect(page.locator(".match-result-pill")).toHaveCount(0);
  const group = await page.getByRole("group", { name: "Replay controls" }).boundingBox();
  const btn = await show.boundingBox();
  expect(btn!.y).toBeGreaterThanOrEqual(group!.y);
  expect(btn!.y + btn!.height).toBeLessThanOrEqual(group!.y + group!.height);
  // The game is over, so What I saw shows the other hand too (#482).
  await expect(page.locator(FAR_FACE_DOWN)).toHaveCount(0);
  await expect(page.locator(FAR_FACE_UP).first()).toBeVisible();
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

test("What I saw keeps the far hand face down; Reveal all turns it face up (#476)", async ({ page }) => {
  await setUp(page);
  await openFromHistory(page);
  await page.getByRole("button", { name: "Step forward" }).click();

  await expect(page.locator(FAR_FACE_DOWN).first()).toBeVisible();
  await expect(page.locator(FAR_FACE_UP)).toHaveCount(0);
  const near = page.locator(":is(.rail-hand-cards, .hand-row-inner, .hand-fan-cards, .hand-dock-cards) .card-tile:not(.card-tile-hidden)");
  await expect(near.first()).toBeVisible();

  await page.getByRole("button", { name: "Reveal all" }).click();
  await expect(page.locator(FAR_FACE_UP).first()).toBeVisible();
  await expect(page.locator(FAR_FACE_DOWN)).toHaveCount(0);

  await page.getByRole("button", { name: "What I saw" }).click();
  await expect(page.locator(FAR_FACE_UP)).toHaveCount(0);
});

test("flipping the board swaps the sides without revealing the other hand (#476)", async ({ page }) => {
  await setUp(page);
  await openFromHistory(page);
  const board = page.locator(".board-root");
  await expect(board).toHaveAttribute("data-seat", "0");

  const flip = page.getByRole("button", { name: /^Flip the board/ });
  if (!(await flip.isVisible())) await page.getByRole("button", { name: "More replay options" }).click();
  await flip.click();
  await expect(board).toHaveAttribute("data-seat", "1");
  // The viewer's own hand (seat 0) is now the far one, still face up; the near hand is the other player's, face down.
  await expect(page.locator(FAR_FACE_UP).first()).toBeVisible();
  await expect(page.locator(".hand-fan-cards .card-tile-hidden, .rail-hand-cards .card-tile-hidden, .hand-row-inner .card-tile-hidden").first()).toBeVisible();
  await flip.click();
  await expect(board).toHaveAttribute("data-seat", "0");
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
    // Neither mode label is clipped by its half of the toggle.
    const clipped = await page.locator(".replay-seg-btn").evaluateAll((els) => els.filter((e) => e.scrollWidth > e.clientWidth).map((e) => e.textContent));
    expect(clipped).toEqual([]);
    // The near hand keeps its room above the controls instead of hiding behind them.
    const hand = await page.locator(".rail-hand-cards .card-tile, .hand-fan-cards .card-tile, .rail-hand-spec .card-tile").first().boundingBox();
    expect(hand).not.toBeNull();
    expect(hand!.y + hand!.height).toBeLessThanOrEqual(box!.y + 1);
    await page.screenshot({ path: info.outputPath("replay-landscape.png") });
  });
});
