/**
 * Log Pose's monthly credit in the panel (#446): the meter, the low-credit line, the notice that replaces the input
 * when a limit stops the player, asking for more, deleting a chat and claiming a free spot. The analyst and the API
 * are faked in the browser; the panel and the Settings page behind it are the real ones.
 */
import type { Page } from "@playwright/test";
import { test, expect, FAKE_API } from "./fixtures";

const ANALYST = "http://127.0.0.1:8766";
const ORIGIN = "http://127.0.0.1:5174";
const cors = { "access-control-allow-origin": ORIGIN, "access-control-allow-credentials": "true", "access-control-allow-headers": "content-type" };

const credit = (over: Record<string, unknown> = {}) => ({
  spent_today_usd: 0.3, daily_cap_usd: 1, spent_month_usd: 40, monthly_cap_usd: 250, allowed: true, model: "claude-sonnet-5-5",
  credit_usd: 5, credit_spent_usd: 1.6, credit_resets_at: "2026-11-01T00:00:00+00:00", refusal: null, avg_chat_cost_usd: 0.1, topup_requested: false, ...over,
});
const sse = (events: [string, unknown][]) => events.map(([e, d]) => `event: ${e}\ndata: ${JSON.stringify(d)}\n\n`).join("");

type Fake = { credit: Record<string, unknown>; session: Record<string, unknown>; requests: string[]; stream?: string; threads: boolean };

async function fake(page: Page, init: Partial<Fake> = {}): Promise<Fake> {
  const st: Fake = {
    credit: credit(),
    session: { enabled: true, token: "chat.x", expires_at: new Date(Date.now() + 3_600_000).toISOString(), chat_url: ANALYST },
    requests: [],
    threads: false,
    ...init,
  };
  await page.route(`${FAKE_API}/**`, (route) => route.fulfill({ status: 404, headers: cors, json: {} }));
  await page.route(`${FAKE_API}/analyst/**`, (route) => {
    const req = route.request();
    const path = new URL(req.url()).pathname;
    st.requests.push(`${req.method()} ${path}`);
    if (req.method() === "OPTIONS") return route.fulfill({ status: 204, headers: cors });
    const json = (body: unknown, status = 200) => route.fulfill({ status, headers: cors, json: body });
    if (path === "/analyst/chat/session") return json(st.session);
    if (path === "/analyst/chat/credit") return json(st.credit);
    if (path === "/analyst/access/topup") return route.fulfill({ status: 204, headers: cors });
    if (path === "/analyst/access/request") return json({ access: "approved" }, 201);
    if (path === "/analyst/chat/threads/1") {
      if (req.method() === "DELETE") return route.fulfill({ status: 204, headers: cors });
      return st.threads
        ? json({ id: 1, title: "Zoro", messages: [{ role: "user", text: "Is Zoro good?" }, { role: "assistant", text: "Yes, keep the two-drops." }] })
        : json({}, 404);
    }
    return json({}, 404);
  });
  await page.route(`${ANALYST}/chat`, (route) => {
    const allow = { "access-control-allow-origin": "*", "access-control-allow-headers": "authorization, content-type, accept", "access-control-allow-methods": "POST, OPTIONS" };
    if (route.request().method() === "OPTIONS") return route.fulfill({ status: 204, headers: allow });
    return route.fulfill({ status: 200, headers: { ...allow, "content-type": "text/event-stream" }, body: st.stream ?? "" });
  });
  await page.addInitScript((threads) => {
    if (sessionStorage.getItem("seeded")) return;
    sessionStorage.setItem("seeded", "1");
    localStorage.clear();
    if (threads) localStorage.setItem("optcg-logpose:thread", "1");
  }, st.threads);
  return st;
}

const openPanel = async (page: Page) => {
  await page.goto("/");
  await page.locator(".lp-compass").click();
  await page.locator(".lp-panel").waitFor();
  // The panel grows out of the compass; measure only once it has settled.
  await expect.poll(() => page.locator(".lp-panel").evaluate((el) => el.getAnimations().length)).toBe(0);
};

test("the meter says what is left this month and a low-credit line counts questions (#446)", async ({ page }) => {
  await fake(page, { credit: credit({ credit_spent_usd: 4.3 }) });
  await openPanel(page);
  const panel = page.locator(".lp-panel");
  await expect(panel.getByText("$0.70 of $5.00 left this month")).toBeVisible();
  await expect(panel.getByText("About 7 questions left")).toBeVisible();
  await expect(panel.getByRole("textbox", { name: "Message Log Pose" })).toBeVisible();
  await expect(panel.getByText("Chats are saved to improve Log Pose.")).toBeVisible();
});

test("out of credit, the input becomes a notice with a way to ask for more and to use your own Claude (#446)", async ({ page }) => {
  const st = await fake(page, { credit: credit({ credit_spent_usd: 5, refusal: "credit" }), threads: true });
  await openPanel(page);
  const panel = page.locator(".lp-panel");
  await expect(panel.getByText("You've used this month's free $5.00 of Log Pose. It refills on November 1.")).toBeVisible();
  await expect(panel.getByRole("textbox", { name: "Message Log Pose" })).toHaveCount(0);
  // The chat stays to read.
  await expect(panel.getByText("Yes, keep the two-drops.")).toBeVisible();
  const ask = panel.getByRole("button", { name: "Ask for more" });
  await ask.click();
  await expect(panel.getByRole("button", { name: "Request sent" })).toBeDisabled();
  expect(st.requests).toContain("POST /analyst/access/topup");
  // The app's own Claude link lives in Settings, so the panel takes the player there and gets out of the way.
  await panel.getByRole("button", { name: "Use Log Pose in your own Claude" }).click();
  await expect(page).toHaveURL(/\/settings#log-pose$/);
  await expect(page.locator(".lp-panel")).toHaveCount(0);
});

test("today's cap says when it is back and how much credit is left, and everyone's cap says it is resting (#446)", async ({ page }) => {
  const st = await fake(page, { credit: credit({ refusal: "daily" }) });
  await openPanel(page);
  const panel = page.locator(".lp-panel");
  await expect(panel.getByText("You've hit today's Log Pose limit. It's back at midnight UTC, with $3.40 of credit left.")).toBeVisible();
  await expect(panel.getByRole("button", { name: "Ask for more" })).toHaveCount(0);
  st.credit = credit({ refusal: "monthly" });
  await page.reload();
  await page.locator(".lp-compass").click();
  await expect(page.locator(".lp-panel").getByText("Log Pose is resting until the 1st.")).toBeVisible();
});

test("a limit that stops an answer keeps the text and swaps the input for the notice, with no error line (#446)", async ({ page }) => {
  const st = await fake(page, {
    stream: sse([["thread", { thread_id: 1 }], ["text", { delta: "Checking the Zoro matchup." }], ["error", { message: "x", code: "credit" }]]),
  });
  await openPanel(page);
  const panel = page.locator(".lp-panel");
  const input = panel.getByRole("textbox", { name: "Message Log Pose" });
  await input.fill("Is Zoro good?");
  // By the time the answer stops, the planner says the credit is gone.
  st.credit = credit({ credit_spent_usd: 5.1, refusal: "credit" });
  await input.press("Enter");
  await expect(panel.getByText("Checking the Zoro matchup.")).toBeVisible();
  await expect(panel.getByText("You've used this month's free $5.00 of Log Pose.")).toBeVisible();
  await expect(panel.getByRole("textbox", { name: "Message Log Pose" })).toHaveCount(0);
  await expect(panel.getByRole("alert")).toHaveCount(0);
});

test("a finished answer moves the meter (#446)", async ({ page }) => {
  const st = await fake(page, {
    stream: sse([["thread", { thread_id: 1 }], ["text", { delta: "Yes." }], ["done", { thread_id: 1, cost_usd: 0.1, credit_usd: 5, credit_spent_usd: 1.7, refusal: null }]]),
  });
  await openPanel(page);
  const panel = page.locator(".lp-panel");
  await expect(panel.getByText("$3.40 of $5.00 left this month")).toBeVisible();
  st.credit = credit({ credit_spent_usd: 1.7 });
  await panel.getByRole("textbox", { name: "Message Log Pose" }).fill("Hi");
  await panel.getByRole("button", { name: "Send" }).click();
  await expect(panel.getByText("$3.30 of $5.00 left this month")).toBeVisible();
});

test("deleting a chat asks first, deletes it and starts a fresh chat (#446)", async ({ page }) => {
  const st = await fake(page, { threads: true });
  await openPanel(page);
  const panel = page.locator(".lp-panel");
  await expect(panel.getByText("Yes, keep the two-drops.")).toBeVisible();
  const notice = panel.locator(".lp-saved");
  const before = await notice.boundingBox();
  await panel.getByRole("button", { name: "Delete this chat" }).click();
  await expect(panel.getByText("Delete this chat for good?")).toBeVisible();
  // The question takes the line's place; nothing moves.
  expect(Math.abs((await notice.boundingBox())!.height - before!.height)).toBeLessThanOrEqual(1);
  await panel.getByRole("button", { name: "Keep" }).click();
  expect(st.requests).not.toContain("DELETE /analyst/chat/threads/1");
  await panel.getByRole("button", { name: "Delete this chat" }).click();
  await panel.getByRole("button", { name: "Delete", exact: true }).click();
  await expect(panel.getByText("Yes, keep the two-drops.")).toHaveCount(0);
  expect(st.requests).toContain("DELETE /analyst/chat/threads/1");
  await expect(panel.getByRole("button", { name: "Delete this chat" })).toHaveCount(0);
});

test("a player with a free spot left claims it and lands in the chat (#446)", async ({ page }) => {
  const st = await fake(page, { session: { enabled: false, access: "none", free_spots: 50, spots_left: 12, free_credit_usd: 5 } });
  await page.goto("/");
  await page.locator(".lp-compass").click();
  const panel = page.locator(".lp-panel");
  await expect(panel.getByRole("heading", { name: "Claim your free Log Pose credit" })).toBeVisible();
  await expect(panel.getByText("12 of 50 free spots left")).toBeVisible();
  // Approved at once: the next session answer turns Log Pose on.
  st.session = { enabled: true, token: "chat.x", expires_at: new Date(Date.now() + 3_600_000).toISOString(), chat_url: ANALYST };
  await panel.getByRole("button", { name: "Claim free credit" }).click();
  await expect(panel.getByRole("textbox", { name: "Message Log Pose" })).toBeVisible();
});

test("with every free spot taken the form offers the waitlist (#446)", async ({ page }) => {
  await fake(page, { session: { enabled: false, access: "none", free_spots: 50, spots_left: 0, free_credit_usd: 5 } });
  await page.goto("/");
  await page.locator(".lp-compass").click();
  const panel = page.locator(".lp-panel");
  await expect(panel.getByText("All 50 free spots are taken. Join the waitlist and we'll let you know.")).toBeVisible();
  await expect(panel.getByRole("button", { name: "Join the waitlist" })).toBeVisible();
});

test("owners switch between Requests and Usage and answer a top-up (#446)", async ({ page }) => {
  const st = await fake(page, {
    session: { enabled: true, token: "chat.x", expires_at: new Date(Date.now() + 3_600_000).toISOString(), chat_url: ANALYST, owner: true, pending_requests: 1 },
    credit: credit({ credit_usd: null }),
  });
  let topup = true;
  await page.route(`${FAKE_API}/analyst/access/requests`, (route) =>
    route.fulfill({
      headers: cors,
      json: {
        free_spots: 50,
        spots_used: 12,
        requests: [
          { user_id: 4, name: "Usopp", note: "", status: "approved", auto_approved: true, credit_usd: 5, credit_spent_usd: 5, topup_requested_at: topup ? "2026-10-09T09:00:00Z" : null, created_at: null, decided_at: null },
        ],
      },
    }),
  );
  await page.route(`${FAKE_API}/analyst/access/requests/4/topup`, (route) => {
    topup = false;
    st.requests.push(`TOPUP ${route.request().postData()}`);
    return route.fulfill({ headers: cors, json: { user_id: 4, name: "Usopp", note: "", status: "approved", auto_approved: true, credit_usd: 10, credit_spent_usd: 5, topup_requested_at: null, created_at: null, decided_at: null } });
  });
  await page.route(`${FAKE_API}/analyst/usage/summary`, (route) =>
    route.fulfill({ headers: cors, json: { today_usd: 0.5, month_usd: 3, total_usd: 12.5, players: [{ user_id: 4, name: "Usopp", spent_usd: 4.2, credit_usd: 5, credit_spent_usd: 4.2, threads: 3, questions: 12, refused: 1, last_used: "2026-10-09T09:00:00Z" }], groups: [] } }),
  );
  await openPanel(page);
  const panel = page.locator(".lp-panel");
  await expect(panel.getByText("$5.00 of $5.00 left this month")).toHaveCount(0); // owners have no credit meter
  await panel.getByRole("button", { name: /^Requests/ }).click();
  await expect(panel.getByText("12 of 50 taken")).toBeVisible();
  await expect(panel.getByText("Asked for more credit")).toBeVisible();
  await panel.getByRole("button", { name: "Add $5" }).click();
  await expect(panel.getByText("Asked for more credit")).toHaveCount(0);
  expect(st.requests).toContain('TOPUP {"action":"add"}');
  await panel.getByRole("tab", { name: "Usage" }).click();
  await expect(panel.getByText("$12.50")).toBeVisible();
  await expect(panel.getByText("3 threads · 12 questions · 1 refused")).toBeVisible();
});
