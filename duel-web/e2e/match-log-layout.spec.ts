/**
 * The match log page lays out two turns per row on desktop and one on phones, with a
 * jump strip to any turn (#470). The FastAPI backend is faked in the browser.
 */
import { test, expect, type Page } from "@playwright/test";
import { FAKE_API } from "./fixtures";

const USER = { id: 7, email: "miko@e2e.test", name: "Miko", username: "MikoTheNavigator" };

const MATCH = {
  match_id: "m1",
  created_at: "2026-10-08T12:00:00Z",
  ranked: false,
  your_seat: 0,
  won: true,
  reason: "life",
  turns: 6,
  your_leader_id: "ST01-001",
  opponent_leader_id: "ST01-001",
  opponent_name: "Rival",
  rating_before: 1500,
  rating_after: 1500,
  has_replay: false,
  has_log: true,
  finished: true,
};

// A trimmed real seat log: turns 1-6 alternate seats, so turns 1/2 are round 1, 3/4 round 2, 5/6 round 3.
const LOG = {"schema": 1, "seat": 0, "openingHand": ["ST01-006", "ST01-003", "ST01-008", "ST01-009", "ST01-008"], "opponentOpeningHand": ["ST01-006", "OP12-002", "ST01-008", "ST01-008", "OP12-002"], "turns": [{"turn": 1, "activeSeat": 0, "events": [{"type": "don_placed", "seat": 0, "count": 1}], "hand": ["ST01-006", "ST01-003", "ST01-008", "ST01-009", "ST01-008"], "opponentHandCount": 5}, {"turn": 2, "activeSeat": 1, "events": [{"type": "drew", "seat": 1, "count": 1, "turnDraw": true}, {"type": "don_placed", "seat": 1, "count": 2}, {"type": "card_played", "seat": 1, "defId": "ST01-006", "instanceId": "card_66", "costPaid": 1}, {"type": "don_given", "seat": 1, "donId": "don_54", "targetId": "leader_52", "targetDefId": "ST01-001", "newPower": 6000}], "hand": ["ST01-006", "ST01-003", "ST01-008", "ST01-009", "ST01-008"], "opponentHandCount": 6}, {"turn": 3, "activeSeat": 0, "events": [{"type": "drew", "seat": 0, "count": 1, "defIds": ["ST01-009"], "turnDraw": true}, {"type": "don_placed", "seat": 0, "count": 2}, {"type": "card_played", "seat": 0, "defId": "ST01-008", "instanceId": "card_34", "costPaid": 3}, {"type": "attack_declared", "seat": 0, "attackerId": "leader_1", "target": {"kind": "leader"}, "attackerPower": 5000, "defenderPower": 5000}], "hand": ["ST01-006", "ST01-003", "ST01-008", "ST01-009", "ST01-008", "ST01-009"], "opponentHandCount": 5}, {"turn": 4, "activeSeat": 1, "events": [{"type": "drew", "seat": 1, "count": 1, "turnDraw": true}, {"type": "don_placed", "seat": 1, "count": 2}, {"type": "card_played", "seat": 1, "defId": "ST01-008", "instanceId": "card_82", "costPaid": 3}, {"type": "don_given", "seat": 1, "donId": "don_56", "targetId": "card_66", "targetDefId": "ST01-006", "newPower": 2000}], "hand": ["ST01-006", "ST01-003", "ST01-008", "ST01-009", "ST01-009"], "opponentHandCount": 7}, {"turn": 5, "activeSeat": 0, "events": [{"type": "drew", "seat": 0, "count": 1, "defIds": ["OP12-002"], "turnDraw": true}, {"type": "don_placed", "seat": 0, "count": 2}, {"type": "don_given", "seat": 0, "donId": "don_2", "targetId": "leader_1", "targetDefId": "ST01-001", "newPower": 6000}, {"type": "card_played", "seat": 0, "defId": "ST01-009", "instanceId": "card_29", "costPaid": 2}], "hand": ["ST01-006", "ST01-003", "ST01-008", "ST01-009", "ST01-009", "ST01-009", "OP12-002"], "opponentHandCount": 6}, {"turn": 6, "activeSeat": 1, "events": [{"type": "drew", "seat": 1, "count": 1, "turnDraw": true}, {"type": "don_placed", "seat": 1, "count": 2}, {"type": "card_played", "seat": 1, "defId": "OP12-002", "instanceId": "card_87", "costPaid": 5}, {"type": "don_given", "seat": 1, "donId": "don_58", "targetId": "leader_52", "targetDefId": "ST01-001", "newPower": 6000}], "hand": ["ST01-003", "ST01-008", "ST01-009", "ST01-009", "OP12-002"], "opponentHandCount": 9}], "boardCards": [["leader_1", "ST01-001", 0], ["leader_52", "ST01-001", 1], ["card_66", "ST01-006", 1], ["card_34", "ST01-008", 0], ["card_82", "ST01-008", 1], ["card_29", "ST01-009", 0], ["card_87", "OP12-002", 1]]};

async function openLog(page: Page): Promise<void> {
  await page.route(`${FAKE_API}/**`, (route) => {
    const path = new URL(route.request().url()).pathname;
    if (path === "/health") return route.fulfill({ json: { ok: true } });
    if (path === "/auth/me") return route.fulfill({ json: USER });
    if (path === "/duel/matches/me/m1") return route.fulfill({ json: { match: MATCH, log: LOG } });
    return route.fulfill({ status: 404, json: { detail: "not in e2e fake API" } });
  });
  await page.goto("/history/m1");
  await expect(page.locator("#turn-6")).toBeVisible();
}

const box = async (page: Page, turn: number) => (await page.locator(`#turn-${turn}`).boundingBox())!;

/** Card names and fonts finish loading after the first paint; measure once the page height stops changing. */
async function settled(page: Page): Promise<void> {
  let last = -1;
  await expect
    .poll(async () => {
      const h = await page.evaluate(() => document.documentElement.scrollHeight);
      const same = h === last;
      last = h;
      return same;
    })
    .toBe(true);
}

async function noSidewaysScroll(page: Page): Promise<void> {
  const over = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  expect(over, "page scrolls sideways").toBeLessThanOrEqual(0);
}

const parts = async (page: Page, turn: number) => {
  const turnBox = page.locator(`#turn-${turn}`);
  return { hands: (await turnBox.locator(".match-log-turn-hand").boundingBox())!, lines: (await turnBox.locator(".match-log-lines").boundingBox())! };
};

test("hands sit beside the turn's plays on desktop (#470)", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "desktop-1280", "desktop layout");
  await openLog(page);
  await settled(page);
  const { hands, lines } = await parts(page, 2);
  expect(hands.x, "hands start right of the plays").toBeGreaterThanOrEqual(lines.x + lines.width - 1);
  expect(Math.abs(hands.y - lines.y), "hands and plays start level").toBeLessThanOrEqual(4);
  await noSidewaysScroll(page);
});

test("hands sit above the turn's plays on phones (#470)", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "phone-375", "phone layout");
  await openLog(page);
  await settled(page);
  const { hands, lines } = await parts(page, 2);
  expect(hands.y + hands.height, "hands end above the plays").toBeLessThanOrEqual(lines.y + 1);
  await noSidewaysScroll(page);
});

test("jump chips scroll to that turn (#470)", async ({ page }) => {
  await openLog(page);
  await settled(page);
  const chip = page.getByRole("navigation", { name: "Jump to turn" }).getByRole("link", { name: "3", exact: true });
  const before = (await chip.boundingBox())!;
  await chip.click();
  // Smooth scrolling takes a moment: wait for it to stop, then the turn's top sits just under the sticky strip.
  let lastY = -1;
  await expect
    .poll(async () => {
      await page.waitForTimeout(150);
      const y = await page.evaluate(() => window.scrollY);
      const stopped = y > 0 && y === lastY;
      lastY = y;
      return stopped;
    })
    .toBe(true);
  const top = await page.evaluate(() => document.getElementById("turn-3")!.getBoundingClientRect().top);
  expect(top, "turn 3 is at the top of the viewport").toBeGreaterThan(0);
  expect(top, "turn 3 is at the top of the viewport").toBeLessThan(120);
  await expect.poll(() => page.evaluate(() => window.location.hash)).toBe("#turn-3");
  await expect(page).toHaveURL(/\/history\/m1#turn-3$/);
  const after = (await chip.boundingBox())!;
  expect(after.width, "chip keeps its size").toBeCloseTo(before.width, 0);
  expect(after.height).toBeCloseTo(before.height, 0);
  await noSidewaysScroll(page);
});
