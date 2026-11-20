import { test, expect, type Page } from "@playwright/test";
import { FAKE_API } from "./fixtures";

const USER = { id: 7, email: "miko@e2e.test", name: "Miko", username: "MikoTheNavigator" };

const base = {
  created_at: "2026-10-08T12:00:00Z",
  ranked: true,
  your_seat: 0,
  won: true,
  reason: "leader_battle_at_zero_life",
  turns: 9,
  your_leader_id: "OP17-039",
  opponent_leader_id: "OP05-060",
  opponent_name: "Rival",
  rating_before: 1500,
  rating_after: 1516,
  has_replay: true,
  replay_ready: true,
  has_log: true,
  finished: true,
};

// Rows that differ the way real ones do: a long opponent name, a chat, a cut-off game, no replay, casual.
const MATCHES = [
  { ...base, match_id: "m1" },
  { ...base, match_id: "m2", won: false, ranked: false, opponent_name: "AVeryLongUsernameThatKeepsGoing_1234567890", has_chat: true, rating_after: 1500 },
  { ...base, match_id: "m3", finished: false, won: false, reason: "unfinished", replay_ready: false, opponent_name: "Nami" },
  { ...base, match_id: "m4", reason: "match_timeout", has_chat: true, replay_ready: false, opponent_leader_id: "OP01-001" },
];

async function openHistory(page: Page, at = "/history"): Promise<void> {
  await page.route(`${FAKE_API}/**`, (route) => {
    const path = new URL(route.request().url()).pathname;
    if (path === "/health") return route.fulfill({ json: { ok: true } });
    if (path === "/auth/me") return route.fulfill({ json: USER });
    if (path === "/duel/matches/me") return route.fulfill({ json: { matches: MATCHES } });
    return route.fulfill({ status: 404, json: { detail: "not in e2e fake API" } });
  });
  await page.goto(at);
  await expect(page.locator(".history-row-link").first()).toBeVisible();
}

for (const [w, h] of [
  [1920, 1080],
  [2560, 1440],
  [375, 812],
] as const) {
  test(`history rows are one height, keep leaders on one line and never scroll sideways at ${w}x${h} (#1388)`, async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== "desktop-1280", "sets its own viewport");
    await page.setViewportSize({ width: w, height: h });
    await openHistory(page);
    const rows = page.locator(".history-row-link");
    const heights = await rows.evaluateAll((els) => els.map((el) => Math.round(el.getBoundingClientRect().height)));
    expect(new Set(heights).size, `row heights ${heights.join(", ")}`).toBe(1);

    const lines = await page.locator(".history-leaders").evaluateAll((els) =>
      els.map((el) => ({ h: el.getBoundingClientRect().height, line: parseFloat(getComputedStyle(el).lineHeight), over: el.scrollWidth - el.clientWidth })),
    );
    for (const l of lines) expect(l.h, "leaders line is one line tall").toBeLessThanOrEqual(l.line * 1.2);
    // The list must not be a narrow column on a big screen: the leaders aren't clipped at desktop sizes.
    if (w >= 1200) for (const l of lines) expect(l.over, "leader names are not cut off").toBeLessThanOrEqual(0);

    const over = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    expect(over, "page scrolls sideways").toBeLessThanOrEqual(0);
    await expect(page.getByText("Cut off")).toBeVisible();
  });
}

test("the Profile page's match list keeps leaders, opponent and result readable on a big screen (#1388)", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "desktop-1280", "sets its own viewport");
  await page.setViewportSize({ width: 1920, height: 1080 });
  await openHistory(page, "/profile");
  // Profile shows the shared list in a narrow panel: the History page's one-line wide grid must not squeeze the text out.
  const widths = await page.locator(".history-row-link").first().evaluate((row) =>
    [".history-leaders", ".history-opp", ".history-how"].map((sel) => Math.round(row.querySelector(sel)!.getBoundingClientRect().width)),
  );
  for (const w of widths) expect(w, `text column widths ${widths.join(", ")}`).toBeGreaterThan(80);
});
