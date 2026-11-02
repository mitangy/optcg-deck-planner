/**
 * Group buy detail (/group-buys/:id): the host can rename the group buy; other
 * members never see the Rename button (#879).
 */
import { expect, test } from "./fixtures";

const GB = 9;
const SHOTS = process.env.PR_SHOTS_DIR;

function detail(isHost: boolean, title: string) {
  return {
    id: GB,
    title,
    status: "open",
    invite_token: "gb-invite-879",
    invite_path: "/group-buy/join/gb-invite-879",
    host_user_id: 1,
    host_name: "Nami",
    member_count: 1,
    is_host: isHost,
    is_public: false,
    public_path: null,
    unique_cards: 0,
    cards_still_needed: 0,
    remaining_market: 0,
    created_at: "2026-01-10T12:00:00Z",
    members: [
      { user_id: 1, display_name: "Nami", role: "host", deck_ids: null, cards_still_needed: 0, remaining_market: 0, card_cost: 0, shipping_share: 0, tax_share: 0, total_owed: 0 },
    ],
    lines: [],
    locked_at: null,
    ordered_at: null,
    external_order_id: "",
    order_notes: "",
    shipping_cost: 0,
    shipping_split: "equal",
    tax_cost: 0,
    cards_subtotal: 0,
    grand_total: 0,
    receipt_text: "",
    has_receipt: false,
    can_undo_purchase: false,
  };
}

test("The host renames a group buy and the new trimmed name shows (#879)", async ({ page, planner }, testInfo) => {
  let title = "Old group buy name";
  const puts: unknown[] = [];
  await page.route(`**/api/group-buys/${GB}/title`, async (route) => {
    const body = route.request().postDataJSON() as { title: string };
    puts.push(body);
    title = body.title;
    await route.fulfill({ json: detail(true, title) });
  });
  await page.route(`**/api/group-buys/${GB}`, (route) => route.fulfill({ json: detail(true, title) }));
  await planner.open(`/group-buys/${GB}`);
  await expect(page.getByRole("heading", { name: "Old group buy name", level: 1 })).toBeVisible();

  await page.getByTestId("gb-rename").click();
  const input = page.getByTestId("gb-title-input");
  await expect(input).toHaveValue("Old group buy name");
  await input.fill("  Friday night pool  ");
  if (SHOTS) await page.screenshot({ path: `${SHOTS}/${testInfo.project.name}-rename-editing.png`, fullPage: true });
  await page.getByTestId("gb-title-save").click();

  await expect(page.getByRole("heading", { name: "Friday night pool", level: 1 })).toBeVisible();
  await expect(input).toHaveCount(0);
  expect(puts).toEqual([{ title: "Friday night pool" }]);
  if (SHOTS) await page.screenshot({ path: `${SHOTS}/${testInfo.project.name}-rename-saved.png`, fullPage: true });
});

test("Escape cancels a rename without saving (#879)", async ({ page, planner }) => {
  let puts = 0;
  await page.route(`**/api/group-buys/${GB}/title`, (route) => {
    puts += 1;
    return route.fulfill({ json: detail(true, "x") });
  });
  await page.route(`**/api/group-buys/${GB}`, (route) => route.fulfill({ json: detail(true, "Keep me") }));
  await planner.open(`/group-buys/${GB}`);
  await page.getByTestId("gb-rename").click();
  await page.getByTestId("gb-title-input").fill("Discarded");
  await page.keyboard.press("Escape");
  await expect(page.getByRole("heading", { name: "Keep me", level: 1 })).toBeVisible();
  expect(puts).toBe(0);
});

test("A member who is not the host does not see Rename (#879)", async ({ page, planner }) => {
  await page.route(`**/api/group-buys/${GB}`, (route) => route.fulfill({ json: detail(false, "Someone else's buy") }));
  await planner.open(`/group-buys/${GB}`);
  await expect(page.getByRole("heading", { name: "Someone else's buy", level: 1 })).toBeVisible();
  await expect(page.getByTestId("gb-rename")).toHaveCount(0);
});

test.afterEach(({ planner }) => {
  expect(planner.errors).toEqual([]);
});
