/**
 * Friends, spares and trades (#703): add a friend, look at their deck, build and send a trade, answer one, and
 * update the collection after a swap. The friends API is faked in friendsFake.ts. Runs at desktop-1200 and
 * phone-375 and ends flows with the UI audit.
 */
import { expect, formatIssues, test } from "./fixtures";
import { expectStationary } from "./audit";
import { COPIED_DECK_ID, installFriendsApi, KAI_DECK_ID, trade } from "./friendsFake";

test.afterEach(({ planner }) => {
  expect(planner.errors).toEqual([]);
});

/** The tray is a fixed layer over the page, so what scrolls under it is expected to be covered. */
const WITH_TRAY = ["[role=dialog]", "[aria-modal=true]", ".market-sales", ".head-popover-panel", ".sort-menu-panel", ".stats-pill", ".trade-tray"];

const nav = (page: import("@playwright/test").Page) => page.locator("nav a.nav-friends");

test("adding a friend sends a request, and an incoming request can be accepted (#703)", async ({ page, planner }) => {
  const fake = await installFriendsApi(page, planner.owned);
  await planner.open("/friends");
  await expect(page.getByRole("heading", { name: "Friends", level: 1 })).toBeVisible();
  const friends = page.getByRole("region", { name: "Your friends" });
  await expect(friends.getByRole("link", { name: "kai" })).toBeVisible();

  await page.getByLabel("Their username").fill("sora");
  await page.getByRole("button", { name: "Send request" }).click();
  await expect(page.getByRole("status").filter({ hasText: "Request sent to sora." })).toBeVisible();
  expect(fake.sent.find((s) => s.path === "/friends/requests")?.body).toEqual({ username: "sora" });
  const requests = page.getByRole("region", { name: "Friend requests" });
  await expect(requests).toContainText("sora");
  await expect(requests).toContainText("request sent");

  await page.getByLabel("Their username").fill("nobody");
  await page.getByRole("button", { name: "Send request" }).click();
  await expect(page.getByText("No player with that username.")).toBeVisible();

  await requests.getByRole("button", { name: "Accept" }).click();
  await expect(friends.getByRole("link", { name: "zoro" })).toBeVisible();

  const issues = await planner.audit();
  expect(issues, formatIssues(issues)).toEqual([]);
});

test("without a username, Friends asks for one first and checks its format (#703)", async ({ page, planner }) => {
  const fake = await installFriendsApi(page, planner.owned, { noUsername: true });
  await planner.open("/friends");
  const name = page.getByLabel("Username");
  await expect(name).toHaveValue("nami_op");
  const save = page.getByRole("button", { name: "Save username" });

  await name.fill("na mi");
  await expect(page.getByRole("alert").filter({ hasText: "Use only letters" })).toBeVisible();
  await expect(save).toBeDisabled();

  await name.fill("nami_op");
  await expect(save).toBeEnabled();
  await save.click();
  await expect(page.getByRole("tab", { name: "Trades" })).toBeVisible();
  expect(fake.username).toBe("nami_op");
});

test("the first visit asks about sharing, then keeps four switches (#703)", async ({ page, planner }) => {
  const fake = await installFriendsApi(page, planner.owned, { prompted: false });
  await planner.open("/friends");
  await expect(page.getByRole("heading", { name: "Let friends see your collection and spares?" })).toBeVisible();
  await page.getByRole("button", { name: "Share collection and spares" }).click();
  expect(fake.sharing).toMatchObject({ decks: "friends", collection: "friends", trades_open: true, prompted: true });

  const sharing = page.getByRole("region", { name: "Sharing" });
  await expect(sharing.getByRole("heading", { name: "Sharing" })).toBeVisible();
  await expect(sharing.getByRole("switch", { name: /Open to trades/ })).toBeChecked();
  await expect(sharing.getByRole("switch", { name: /Show prices/ })).not.toBeChecked();
  await sharing.getByRole("switch", { name: /Show prices/ }).click();
  await expect(sharing.getByRole("switch", { name: /Show prices/ })).toBeChecked();
  await expect.poll(() => fake.sharing.show_values).toBe(true);
  // Turning the collection off turns prices off with it.
  await sharing.getByRole("switch", { name: /^Collection/ }).click();
  await expect.poll(() => fake.sharing.collection).toBe("off");
  expect(fake.sharing.show_values).toBe(false);
  await expect(sharing.getByRole("switch", { name: /Show prices/ })).toBeDisabled();
});

test("a friend's deck shows what I'd still need from my own collection, and copies to my decks (#703)", async ({ page, planner }) => {
  // I own 1 Kid & Killer, so Izo (2 short), Kid & Killer (3 short) and the event (2 short) are missing.
  planner.owned.set("EB01-003", 1);
  const fake = await installFriendsApi(page, planner.owned);
  await planner.open("/friends/kai");
  await expect(page.getByRole("heading", { name: "kai", level: 1 })).toBeVisible();
  await page.getByRole("link", { name: /Kai's Oden/ }).click();
  await expect(page).toHaveURL(new RegExp(`/friends/kai/decks/${KAI_DECK_ID}$`));

  const summary = page.getByRole("region", { name: "What I'd need" });
  await expect(summary).toContainText("missing 7 cards");
  await expect(summary).toContainText("$29.90");

  await page.getByRole("checkbox", { name: "Only cards I'm missing" }).check();
  const rows = page.locator("[data-card-id]:visible");
  await expect(rows).toHaveCount(3);
  await expect(page.locator('[data-card-id="EB01-002"]:visible')).toContainText("Need 2 more (own 2)");
  await expect(page.locator('[data-card-id="EB01-003"]:visible')).toContainText("Need 3 more (own 1)");
  await expect(page.locator('[data-card-id="EB01-001"]:visible')).toHaveCount(0);

  const issues = await planner.audit();
  expect(issues, formatIssues(issues)).toEqual([]);

  await page.getByRole("button", { name: "Copy to my decks" }).click();
  await expect(page).toHaveURL(new RegExp(`/decks/${COPIED_DECK_ID}$`));
  expect(fake.sent.some((s) => s.path === `/friends/2/decks/${KAI_DECK_ID}/copy`)).toBe(true);
});

test("a friend's collection can be searched and filtered (#703)", async ({ page, planner }) => {
  await installFriendsApi(page, planner.owned);
  await planner.open("/friends/kai?tab=collection");
  const rows = page.locator("[data-card-id]:visible");
  await expect(rows).toHaveCount(3);
  await page.getByRole("searchbox").fill("kid");
  await expect(rows).toHaveCount(1);
  await expect(rows.first()).toContainText("Kid & Killer");
  await page.getByRole("searchbox").fill("");
  await page.getByLabel("Color").selectOption("Green");
  await expect(page.getByText("No matches")).toBeVisible();
  const issues = await planner.audit();
  expect(issues, formatIssues(issues)).toEqual([]);
});

test("building a trade from Spares caps copies at what is spare and sends the offer (#703)", async ({ page, planner }) => {
  const fake = await installFriendsApi(page, planner.owned);
  await planner.open("/friends/kai?tab=spares");
  await expect(page.getByRole("region", { name: "They have, you need" })).toBeVisible();
  await expect(page.getByRole("region", { name: "Their spares" })).toContainText("Tony Tony.Chopper");
  await expect(page.getByRole("region", { name: "You have, they need" })).toContainText("Tony Tony.Chopper");

  // Opening the tray must not move the row you are stepping.
  const more = page.getByRole("button", { name: "More EB01-003 to get" });
  await expectStationary(more, () => more.click(), "Kid & Killer +");
  const tray = page.getByRole("region", { name: "Trade tray" });
  await expect(tray).toBeVisible();
  for (let i = 0; i < 4; i++) if (await more.isEnabled()) await more.click();
  // Kai has 3 spare.
  await expect(page.getByLabel("EB01-003 to get count")).toHaveText("3");
  await expect(more).toBeDisabled();

  // The tray is pinned to the bottom edge of the screen.
  const box = (await tray.boundingBox())!;
  const viewport = page.viewportSize()!;
  expect(Math.abs(box.y + box.height - viewport.height)).toBeLessThan(2);

  // Scrolled to the end, the footer stays clear of the tray.
  await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
  const footer = (await page.locator("footer.site-footer").boundingBox())!;
  expect(footer.y + footer.height).toBeLessThanOrEqual((await tray.boundingBox())!.y + 1);
  await page.evaluate(() => window.scrollTo(0, 0));

  await page.getByRole("button", { name: "More EB01-006 to give" }).click();
  await page.getByLabel("Printing of EB01-002").selectOption({ label: "Alt art ×1" });
  await page.getByRole("button", { name: "More EB01-002 to get" }).click();
  await expect(tray).toContainText("Give 1 · Get 4");

  await tray.getByRole("button", { name: /Offer to kai/ }).click();
  await expect(tray).toContainText("Alt art");
  await expect(tray.locator(".tray-group").filter({ hasText: "You give" })).toContainText("Tony Tony.Chopper");
  await expect(tray.locator(".tray-group").filter({ hasText: "You get" })).toContainText("Kid & Killer");
  await tray.getByLabel("Message (optional)").fill("Deal?");
  const issues = await planner.audit({ overlays: WITH_TRAY });
  expect(issues, formatIssues(issues)).toEqual([]);

  await tray.getByRole("button", { name: "Send offer" }).click();
  await expect(page).toHaveURL(/\/friends\?tab=trades$/);
  expect(fake.sent.find((s) => s.path === "/trades")?.body).toEqual({
    to_user_id: 2,
    message: "Deal?",
    lines: [
      { side: "get", card_id: "EB01-003", product_id: null, qty: 3 },
      { side: "give", card_id: "EB01-006", product_id: null, qty: 1 },
      { side: "get", card_id: "EB01-002", product_id: 201, qty: 1 },
    ],
  });
  await expect(page.getByRole("region", { name: "Waiting on them" })).toContainText("Your offer to kai");
});

const offer = () =>
  trade({
    id: 100,
    message: "Chopper for my Kid & Killer?",
    lines: [
      { side: "give", card_id: "EB01-003", product_id: null, qty: 2 },
      { side: "get", card_id: "EB01-006", product_id: null, qty: 1 },
    ],
  });

test("an incoming offer shows both sides with values, and accepting it makes it active (#703)", async ({ page, planner }) => {
  await installFriendsApi(page, planner.owned, { trades: [offer()] });
  await planner.open("/friends?tab=trades");
  const incoming = page.getByRole("region", { name: "Offers for you" });
  await expect(incoming).toContainText("kai offered you a trade");
  // Kai gives 2 Kid & Killer ($13.60) and gets 1 Chopper ($0.30), seen from my side.
  await expect(incoming.locator(".trade-side").filter({ hasText: "You get" })).toContainText("$13.60");
  await expect(incoming.locator(".trade-side").filter({ hasText: "You get" })).toContainText("Kid & Killer");
  await expect(incoming.locator(".trade-side").filter({ hasText: "You give" })).toContainText("$0.30");
  await expect(incoming.locator(".trade-side").filter({ hasText: "You give" })).toContainText("Tony Tony.Chopper");
  await expect(incoming).toContainText("Chopper for my Kid & Killer?");
  await expect(nav(page).locator(".nav-badge")).toHaveText("1");

  await incoming.getByRole("button", { name: "Accept" }).click();
  const active = page.getByRole("region", { name: "Active" });
  await expect(active).toContainText("Agreed");
  await expect(page.getByRole("region", { name: "Offers for you" })).toHaveCount(0);
  const issues = await planner.audit();
  expect(issues, formatIssues(issues)).toEqual([]);
});

test("declining an offer moves it to History (#703)", async ({ page, planner }) => {
  await installFriendsApi(page, planner.owned, { trades: [offer()] });
  await planner.open("/friends?tab=trades");
  await page.getByRole("button", { name: "Decline" }).click();
  await expect(page.getByRole("region", { name: "History" })).toContainText("Declined");
  await expect(nav(page).locator(".nav-badge")).toHaveCount(0);
});

test("countering opens Spares with the offer turned around, and sends it as a counter (#703)", async ({ page, planner }) => {
  const fake = await installFriendsApi(page, planner.owned, { trades: [offer()] });
  await planner.open("/friends?tab=trades");
  await page.getByRole("link", { name: "Counter" }).click();
  await expect(page).toHaveURL(/\/friends\/kai\?tab=spares&counter=100$/);
  const tray = page.getByRole("region", { name: "Trade tray" });
  await expect(tray).toContainText("Counter to kai");
  // Kai asked me for a Chopper and offered two Kid & Killer: from my side that is give 1, get 2.
  await expect(tray).toContainText("Give 1 · Get 2");
  await page.getByRole("button", { name: "Fewer EB01-003 to get" }).click();
  await tray.getByRole("button", { name: "Send counter" }).click();
  await expect(page).toHaveURL(/\/friends\?tab=trades$/);
  expect(fake.sent.find((s) => s.path === "/trades/100/counter")?.body).toEqual({
    message: "",
    lines: [
      { side: "get", card_id: "EB01-003", product_id: null, qty: 1 },
      { side: "give", card_id: "EB01-006", product_id: null, qty: 1 },
    ],
  });
});

test("after we traded, Update my collection changes only my counts, and Undo puts them back (#703)", async ({ page, planner }) => {
  const agreed = trade({ ...offer(), status: "accepted" });
  const fake = await installFriendsApi(page, planner.owned, { trades: [agreed] });
  // Look at the Collection first, so it has to refresh after the update.
  await planner.open("/collection");
  await expect(page.locator('[data-card-id="EB01-006"]:visible')).toBeVisible();
  await expect(page.locator('[data-card-id="EB01-003"]:visible')).toHaveCount(0);
  const link = nav(page);
  await expect(link.locator(".nav-badge")).toHaveText("1");

  await link.click();
  await page.getByRole("tab", { name: /Trades/ }).click();
  await expect(link.locator(".nav-badge")).toHaveText("1");
  const widthWithBadge = (await link.boundingBox())!.width;
  const active = page.getByRole("region", { name: "Active" });
  await active.getByRole("button", { name: "We traded" }).click();
  await expect(active).toContainText("Update your collection to match?");
  // Nothing changes until I say so.
  expect(planner.owned.get("EB01-003")).toBe(0);
  await active.getByRole("button", { name: "Update my collection" }).click();
  // I received 2 Kid & Killer and handed over a Chopper.
  await expect.poll(() => planner.owned.get("EB01-003")).toBe(2);
  expect(planner.owned.get("EB01-006")).toBe(2);
  expect(fake.trades[0]!.applied).toBe(true);

  // Nothing is waiting any more: the badge goes, and the link keeps its size.
  await expect(link.locator(".nav-badge")).toHaveCount(0);
  expect((await link.boundingBox())!.width).toBeCloseTo(widthWithBadge, 0);

  await page.getByRole("link", { name: "Collection" }).click();
  await expect(page.locator('[data-card-id="EB01-003"]:visible')).toBeVisible();

  await link.click();
  await page.getByRole("tab", { name: "Trades" }).click();
  await page.getByRole("button", { name: "Undo collection update" }).click();
  await expect.poll(() => planner.owned.get("EB01-003")).toBe(0);
  expect(planner.owned.get("EB01-006")).toBe(3);
});

test("Keep holds copies back from trades and gives them back (#703)", async ({ page, planner }) => {
  const fake = await installFriendsApi(page, planner.owned);
  await planner.open("/friends?tab=spares");
  const row = page.locator('[data-card-id="EB01-006"]:visible');
  await expect(row).toContainText("2 spare");
  await row.getByRole("button", { name: "More kept EB01-006" }).click();
  await expect(row).toContainText("1 spare");
  await expect.poll(() => fake.keep.get("EB01-006")).toBe(1);
  // Keep everything: the row stays so the hold can be undone.
  await row.getByRole("button", { name: "More kept EB01-006" }).click();
  await expect(row).toContainText("0 spare");
  await expect(row.getByRole("button", { name: "More kept EB01-006" })).toBeDisabled();
  await row.getByRole("button", { name: "Fewer kept EB01-006" }).click();
  await expect(row).toContainText("1 spare");
  const issues = await planner.audit();
  expect(issues, formatIssues(issues)).toEqual([]);
});

test("a deck can be hidden from friends in the deck editor menu (#703)", async ({ page, planner }) => {
  await planner.open("/decks/1");
  await page.getByRole("button", { name: "More" }).click();
  await page.getByRole("menuitemcheckbox", { name: /Hide from friends/ }).click();
  await expect.poll(() => planner.deckHidden).toBe(true);
  await page.getByRole("button", { name: "More" }).click();
  await expect(page.getByRole("menuitemcheckbox", { name: /Hidden from friends/ })).toBeChecked();
  // Choosing it again shows the deck to friends again.
  await page.getByRole("menuitemcheckbox", { name: /Hidden from friends/ }).click();
  await expect.poll(() => planner.deckHidden).toBe(false);
});
