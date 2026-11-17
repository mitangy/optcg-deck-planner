/**
 * Decks page lays leader groups out side by side on wide screens (#1324): a leader with one deck takes one
 * column, a leader with three decks spans three, and a phone keeps one column.
 */
import type { Page } from "@playwright/test";
import type { DeckSummary } from "../src/api";
import { expect, test } from "./fixtures";

const deck = (id: number, name: string, leader: string, leaderName: string): DeckSummary => ({
  id,
  name,
  leader_card_id: leader,
  leader_name: leaderName,
  card_count: 20,
  total_cards: 51,
  main_cards: 51,
  don_cards: 0,
  owned_copies: 10,
  sort_order: id,
  is_main: false,
});

const DECKS: DeckSummary[] = [
  deck(11, "Pudding eb05", "EB05-001", "Pudding"),
  deck(12, "Newgate OP 18", "OP18-001", "Edward Newgate"),
  deck(13, "Lucy op17", "OP17-039", "Lucy"),
  deck(14, "Elbuffy", "OP13-001", "Monkey D. Luffy"),
  deck(15, "op18 GY Robin", "OP18-040", "Nico Robin"),
  deck(16, "Elbuffy B", "OP13-001", "Monkey D. Luffy"),
  deck(17, "Elbuffy C", "OP13-001", "Monkey D. Luffy"),
];

test.afterEach(({ planner }) => {
  expect(planner.errors).toEqual([]);
});

async function openDecks(page: Page, planner: { open(p: string): Promise<void> }) {
  await page.route("**/api/decks", (route) =>
    route.request().method() === "GET" ? route.fulfill({ json: DECKS }) : route.fallback(),
  );
  await planner.open("/decks");
  await expect(page.locator(".deck-card")).toHaveCount(DECKS.length);
}

const boxes = (page: Page, sel: string) =>
  page.locator(sel).evaluateAll((els) =>
    els.map((el) => {
      const r = el.getBoundingClientRect();
      return { top: Math.round(r.top), bottom: Math.round(r.bottom), left: Math.round(r.left) };
    }),
  );

test("Decks: on a wide screen leaders sit side by side and a leader's decks sit next to each other (#1324)", async ({ page, planner }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await openDecks(page, planner);

  const groups = await boxes(page, ".deck-leader-group");
  const sameRow = groups.filter((g) => g.top === groups[0]!.top);
  expect(sameRow.length).toBeGreaterThanOrEqual(2);

  const multi = await boxes(page, ".deck-leader-group:has(.deck-card:nth-child(3)) .deck-card");
  expect(multi).toHaveLength(3);
  expect(new Set(multi.map((d) => d.top)).size).toBe(1);
  expect(multi[0]!.left).toBeLessThan(multi[1]!.left);
  expect(multi[1]!.left).toBeLessThan(multi[2]!.left);
  expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)).toBeLessThanOrEqual(0);
});

test("Decks: on a phone leader groups stay stacked in one column (#1324)", async ({ page, planner }) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await openDecks(page, planner);

  const groups = await boxes(page, ".deck-leader-group");
  for (let i = 1; i < groups.length; i++) expect(groups[i]!.top).toBeGreaterThan(groups[i - 1]!.bottom);
  expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)).toBeLessThanOrEqual(0);
});
