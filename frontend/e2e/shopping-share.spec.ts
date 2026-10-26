/**
 * The shopping list (home) and the public share page at /share/:token.
 * Each flow ends with the UI audit; runs at desktop-1200 and phone-375.
 */
import { DECK_ID, expect, formatIssues, test, SHARE_TOKEN } from "./fixtures";
import { expectStationary } from "./audit";

test.afterEach(({ planner }) => {
  expect(planner.errors).toEqual([]);
});

test("shopping list hides fully owned cards and passes the audit", async ({ page, planner }) => {
  await planner.open("/");
  await expect(page.getByRole("heading", { name: "Master Shopping", level: 1 })).toBeVisible();
  // "Still need only" is on by default: the fully owned Chopper is not listed.
  await expect(page.getByText("Tony Tony.Chopper")).toHaveCount(0);
  await expect(page.getByText("Kid & Killer").filter({ visible: true }).first()).toBeVisible();

  const price = page.getByRole("button", { name: /\$6\.80/ });
  await expectStationary(price, () => price.click(), "shopping market price");
  const panel = page.getByRole("region", { name: "Last 3 sold prices" });
  await expect(panel).toBeInViewport({ ratio: 1 });
  // The audit scrolls the whole page and the open panel follows its price off
  // screen (the Add cards drawer moved the list down, #527); its on-screen fit
  // is the toBeInViewport check above, as in deck.spec.
  const issues = await planner.audit({ offscreenOk: [".market-sales"] });
  expect(issues, formatIssues(issues)).toEqual([]);
});

test("shopping list switches to the grid layout", async ({ page, planner }) => {
  await planner.open("/");
  const grid = page.getByRole("button", { name: "Grid", exact: true });
  await expectStationary(grid, () => grid.click(), "Grid toggle");
  await expect(grid).toHaveAttribute("aria-pressed", "true");
  const issues = await planner.audit();
  expect(issues, formatIssues(issues)).toEqual([]);
});

test("share page lists the shared cards with prices and passes the audit", async ({ page, planner }) => {
  await planner.open(`/share/${SHARE_TOKEN}`);
  await expect(page.getByRole("heading", { name: "Oden Red/Green", level: 1 })).toBeVisible();
  await expect(page.getByText(/Shared by Nami/)).toBeVisible();
  await expect(page.getByText("Kid & Killer").filter({ visible: true }).first()).toBeVisible();
  await expect(page.getByText("Izo", { exact: true }).filter({ visible: true }).first()).toBeVisible();
  expect(planner.requests).toContain(`GET /public/share/${SHARE_TOKEN}`);

  const grid = page.getByRole("button", { name: "Grid", exact: true });
  await expectStationary(grid, () => grid.click(), "Grid toggle");
  const price = page.getByRole("button", { name: /\$6\.80/ });
  await expectStationary(price, () => price.click(), "share market price");
  const issues = await planner.audit();
  expect(issues, formatIssues(issues)).toEqual([]);
});

test("signed-in viewer adds the shared deck to their decks (#741)", async ({ page, planner }) => {
  await planner.open(`/share/${SHARE_TOKEN}`);
  await expect(page.getByText(/Owned counts are from your collection/)).toBeVisible();
  await expect(page.getByRole("link", { name: "Sign in", exact: true })).toHaveCount(0);
  await expect(page.getByRole("link", { name: "My decks" })).toBeVisible();
  const add = page.getByRole("button", { name: "Add to my decks" });
  await expect(add).toBeVisible();
  const issues = await planner.audit();
  expect(issues, formatIssues(issues)).toEqual([]);

  await add.click();
  await expect(page).toHaveURL(new RegExp(`/decks/${DECK_ID}$`));
  expect(planner.requests).toContain(`POST /public/share/${SHARE_TOKEN}/copy`);
});

test("signed-out viewer is sent to sign in and back to the shared deck (#741)", async ({ page, planner }) => {
  planner.signOut();
  await planner.open(`/share/${SHARE_TOKEN}`);
  await expect(page.getByText("Sign in to see which of these cards you own.")).toBeVisible();
  await expect(page.getByRole("button", { name: "Add to my decks" })).toHaveCount(0);
  const next = encodeURIComponent(`/share/${SHARE_TOKEN}`);
  const add = page.getByRole("link", { name: "Sign in to add" });
  await expect(add).toHaveAttribute("href", `/login?next=${next}`);
  await expect(page.getByRole("link", { name: "Sign in", exact: true })).toHaveAttribute("href", `/login?next=${next}`);
  const issues = await planner.audit();
  expect(issues, formatIssues(issues)).toEqual([]);
});

test("share page for a revoked link says so instead of showing a list", async ({ page, planner }) => {
  await planner.open("/share/not-a-real-token");
  await expect(page.getByText("This share link is no longer available")).toBeVisible();
  await expect(page.getByRole("heading", { level: 1 })).toHaveCount(0);
  const issues = await planner.audit();
  expect(issues, formatIssues(issues)).toEqual([]);
});
