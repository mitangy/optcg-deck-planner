import { readFileSync } from "node:fs";
import { expect, test } from "./fixtures";

test.afterEach(({ planner }) => {
  expect(planner.errors).toEqual([]);
});

type Deck = { cards: { card_id: string; count: number; market_price?: number | null }[]; card_count: number };
const FIXTURE = JSON.parse(readFileSync(new URL("./fixtures/meta-decks.json", import.meta.url), "utf8")) as { decks: Deck[] };

test("each tournament list shows how much of it you own and what it costs to finish, signed in only (#1342)", async ({ page, planner }) => {
  const first = FIXTURE.decks[0]!;
  const body = {
    ...FIXTURE,
    leader_market_price: 2,
    decks: FIXTURE.decks.map((d) => ({ ...d, cards: d.cards.map((c) => ({ ...c, market_price: 1 })) })),
  };
  const owned = first.cards[0]!;
  await page.route("**/api/meta/decks*", (route) => route.fulfill({ json: body }));
  // More copies than the list plays must not count beyond the list.
  await page.route("**/api/owned", (route) =>
    route.fulfill({
      json: { items: [{ card_id: owned.card_id, owned: owned.count + 5 }], unique_cards: 1, total_copies: owned.count + 5, total_value: 0, unpriced_cards: 0 },
    }),
  );
  await planner.open("/meta?leader=OP17-039&top8=1");
  const total = first.card_count + 1;
  const left = (2 + first.card_count - owned.count).toFixed(2);
  await expect(page.locator(".meta-deck-own").first()).toHaveText("You own " + owned.count + " of " + total + " · $" + left + " to finish");

  planner.signOut();
  await planner.open("/meta?leader=OP17-039&top8=1");
  await expect(page.locator(".meta-deck-head").first()).toBeVisible();
  await expect(page.locator(".meta-deck-own")).toHaveCount(0);
});
