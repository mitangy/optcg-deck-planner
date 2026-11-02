/**
 * Group buy detail (/group-buys/:id): non-host members can leave an open group
 * buy; the host never sees Leave (#881).
 */
import { expect, test } from "./fixtures";

const GB = 9;
const SHOTS = process.env.PR_SHOTS_DIR;

function detail(isHost: boolean, status = "open") {
  return {
    id: GB,
    title: "Friday pool",
    status,
    invite_token: "gb-invite-881",
    invite_path: "/group-buy/join/gb-invite-881",
    host_user_id: isHost ? 1 : 2,
    host_name: isHost ? "Nami" : "Luffy",
    member_count: 2,
    is_host: isHost,
    is_public: false,
    public_path: null,
    unique_cards: 0,
    cards_still_needed: 0,
    remaining_market: 0,
    created_at: "2026-01-10T12:00:00Z",
    members: [
      { user_id: 1, display_name: "Nami", role: isHost ? "host" : "member", deck_ids: null, cards_still_needed: 0, remaining_market: 0, card_cost: 0, shipping_share: 0, tax_share: 0, total_owed: 0 },
      { user_id: 2, display_name: "Luffy", role: isHost ? "member" : "host", deck_ids: null, cards_still_needed: 0, remaining_market: 0, card_cost: 0, shipping_share: 0, tax_share: 0, total_owed: 0 },
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

test("A member leaves a group buy after confirming and lands on the list (#881)", async ({ page, planner }, testInfo) => {
  const posts: string[] = [];
  await page.route(`**/api/group-buys/${GB}/leave`, (route) => {
    posts.push(route.request().method());
    return route.fulfill({ json: { ok: true } });
  });
  await page.route(`**/api/group-buys/${GB}`, (route) => route.fulfill({ json: detail(false) }));
  await planner.open(`/group-buys/${GB}`);
  const leave = page.getByRole("button", { name: "Leave group buy" });
  await expect(leave).toBeEnabled();
  if (SHOTS) await page.screenshot({ path: `${SHOTS}/${testInfo.project.name}-leave-button.png`, fullPage: true });

  // Dismissing the confirm sends nothing.
  page.once("dialog", (d) => d.dismiss());
  await leave.click();
  expect(posts).toEqual([]);

  page.once("dialog", (d) => d.accept());
  await leave.click();
  await expect(page).toHaveURL(/\/group-buys$/);
  expect(posts).toEqual(["POST"]);
});

test("Leave is disabled while the group buy is locked (#881)", async ({ page, planner }) => {
  await page.route(`**/api/group-buys/${GB}`, (route) => route.fulfill({ json: detail(false, "locked") }));
  await planner.open(`/group-buys/${GB}`);
  const leave = page.getByRole("button", { name: "Leave group buy" });
  await expect(leave).toBeDisabled();
  await expect(leave).toHaveAttribute("title", "Ask the host to unlock first");
});

test("The host does not see Leave group buy (#881)", async ({ page, planner }) => {
  await page.route(`**/api/group-buys/${GB}`, (route) => route.fulfill({ json: detail(true) }));
  await planner.open(`/group-buys/${GB}`);
  await expect(page.getByRole("button", { name: "Delete" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Leave group buy" })).toHaveCount(0);
});

test.afterEach(({ planner }) => {
  expect(planner.errors).toEqual([]);
});
