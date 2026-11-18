import { expect, test } from "./fixtures";

const GB = 9;
const SHOTS = process.env.PR_SHOTS_DIR;
const CONFIRM =
  "Reset the invite link? The current link stops working for everyone who has it. People already in the group buy stay in.";

function detail(isHost: boolean, token: string) {
  return {
    id: GB,
    title: "Friday pool",
    status: "open",
    invite_token: token,
    invite_path: `/group-buy/join/${token}`,
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

test("The host resets the invite link and the next copy uses the new one (#1346)", async ({ page, planner }, testInfo) => {
  let token = "old-token";
  let resets = 0;
  await page.addInitScript(() => {
    const w = window as unknown as { __copied: string[] };
    w.__copied = [];
    Object.defineProperty(navigator, "clipboard", {
      value: { writeText: async (t: string) => void w.__copied.push(t) },
      configurable: true,
    });
  });
  await page.route(`**/api/group-buys/${GB}/invite/reset`, (route) => {
    resets += 1;
    token = "new-token";
    return route.fulfill({ json: detail(true, token) });
  });
  await page.route(`**/api/group-buys/${GB}`, (route) => route.fulfill({ json: detail(true, token) }));
  await planner.open(`/group-buys/${GB}`);

  const copy = page.getByRole("button", { name: "Copy invite link" });
  await copy.click();
  const reset = page.getByTestId("gb-reset-invite");
  const before = await reset.boundingBox();
  if (SHOTS) await page.screenshot({ path: `${SHOTS}/${testInfo.project.name}-invite-panel.png` });

  const messages: string[] = [];
  page.once("dialog", (d) => {
    messages.push(d.message());
    void d.accept();
  });
  await reset.click();
  await expect(page.getByRole("status").filter({ hasText: "Invite link reset" })).toBeVisible();
  expect(messages).toEqual([CONFIRM]);
  expect(resets).toBe(1);
  expect(await reset.boundingBox()).toEqual(before);

  await copy.click();
  const copied = await page.evaluate(() => (window as unknown as { __copied: string[] }).__copied);
  expect(copied[0]).toContain("/group-buy/join/old-token");
  expect(copied[copied.length - 1]).toContain("/group-buy/join/new-token");
});

test("Cancelling the reset confirm leaves the invite link alone (#1346)", async ({ page, planner }) => {
  let resets = 0;
  await page.route(`**/api/group-buys/${GB}/invite/reset`, (route) => {
    resets += 1;
    return route.fulfill({ json: detail(true, "x") });
  });
  await page.route(`**/api/group-buys/${GB}`, (route) => route.fulfill({ json: detail(true, "old-token") }));
  await planner.open(`/group-buys/${GB}`);
  page.once("dialog", (d) => void d.dismiss());
  await page.getByTestId("gb-reset-invite").click();
  expect(resets).toBe(0);
});

test("A member who is not the host does not see Reset link (#1346)", async ({ page, planner }) => {
  await page.route(`**/api/group-buys/${GB}`, (route) => route.fulfill({ json: detail(false, "old-token") }));
  await planner.open(`/group-buys/${GB}`);
  await expect(page.getByRole("button", { name: "Copy invite link" })).toBeVisible();
  await expect(page.getByTestId("gb-reset-invite")).toHaveCount(0);
});

test.afterEach(({ planner }) => {
  expect(planner.errors).toEqual([]);
});
