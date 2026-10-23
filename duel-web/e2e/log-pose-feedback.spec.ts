/**
 * Rating Log Pose answers in the panel (#679): thumbs up / down and "This is wrong" with a note. The analyst and the API
 * are faked in the browser; the panel is the real one. Runs at desktop and phone width.
 */
import type { Page } from "@playwright/test";
import { test, expect, FAKE_API } from "./fixtures";

const ANALYST = "http://127.0.0.1:8766";
const ORIGIN = process.env.E2E_PAGE_ORIGIN ?? "http://127.0.0.1:5174";
const cors = { "access-control-allow-origin": ORIGIN, "access-control-allow-credentials": "true", "access-control-allow-headers": "content-type" };

type Vote = { kind: string; rating: string; note: string; thread_id: number | null; message_index: number | null; match_id: string | null };
type Fake = { posts: Record<string, unknown>[]; votes: Vote[]; failPost: number | null };

async function fake(page: Page, init: Partial<Fake> = {}): Promise<Fake> {
  const st: Fake = { posts: [], votes: [], failPost: null, ...init };
  await page.route(`${FAKE_API}/**`, (route) => route.fulfill({ status: 404, headers: cors, json: {} }));
  await page.route(`${FAKE_API}/analyst/**`, (route) => {
    const req = route.request();
    const path = new URL(req.url()).pathname;
    if (req.method() === "OPTIONS") return route.fulfill({ status: 204, headers: { ...cors, "access-control-allow-methods": "GET, POST, DELETE, OPTIONS" } });
    const json = (body: unknown, status = 200) => route.fulfill({ status, headers: cors, json: body });
    if (path === "/analyst/chat/session") {
      return json({ enabled: true, token: "chat.x", expires_at: new Date(Date.now() + 3_600_000).toISOString(), chat_url: ANALYST });
    }
    if (path === "/analyst/chat/credit") {
      return json({ spent_today_usd: 0.3, daily_cap_usd: 1, spent_month_usd: 40, monthly_cap_usd: 250, allowed: true, model: "claude-sonnet-5-5", credit_usd: null, credit_spent_usd: 0, credit_resets_at: "2026-11-01T00:00:00+00:00", refusal: null, avg_chat_cost_usd: 0.1, topup_requested: false });
    }
    if (path === "/analyst/chat/threads/1") {
      return json({
        id: 1,
        title: "Zoro",
        messages: [
          { role: "user", text: "Is Zoro good?" },
          { role: "assistant", text: "Yes, keep the two-drops and play Zoro on turn 2." },
          { role: "user", text: "And the Nami?" },
          { role: "assistant", text: "Keep the Nami until you can afford the big one." },
        ],
      });
    }
    if (path === "/analyst/feedback" && req.method() === "GET") return json({ votes: st.votes });
    if (path === "/analyst/feedback" && req.method() === "POST") {
      if (st.failPost) return json({ detail: "no" }, st.failPost);
      const body = req.postDataJSON() as Record<string, unknown>;
      st.posts.push(body);
      return json({ kind: body.kind, rating: body.rating, note: body.note, thread_id: body.thread_id ?? null, message_index: body.message_index ?? null, match_id: null });
    }
    return json({}, 404);
  });
  await page.addInitScript(() => {
    if (sessionStorage.getItem("seeded")) return;
    sessionStorage.setItem("seeded", "1");
    localStorage.clear();
    localStorage.setItem("optcg-logpose:thread", "1");
  });
  return st;
}

const openPanel = async (page: Page) => {
  await page.goto("/");
  await page.locator(".lp-compass").click();
  await page.locator(".lp-panel").waitFor();
  await expect.poll(() => page.locator(".lp-panel").evaluate((el) => el.getAnimations().length)).toBe(0);
};

/** The buttons' boxes relative to the bar itself, so the panel scrolling to show the note form doesn't count as the buttons moving. */
const boxes = (bar: ReturnType<Page["locator"]>) =>
  bar.locator(".lp-fb-btn").evaluateAll((els) => {
    const root = els[0]!.closest(".lp-fb")!.getBoundingClientRect();
    return els.map((e) => {
      const r = e.getBoundingClientRect();
      return [Math.round((r.x - root.x) * 10) / 10, Math.round((r.y - root.y) * 10) / 10, Math.round(r.width * 10) / 10, Math.round(r.height * 10) / 10];
    });
  });

test("every saved answer has thumbs and 'This is wrong', and a vote is a quiet Thanks that moves nothing (#679)", async ({ page }) => {
  const st = await fake(page);
  await openPanel(page);
  const bars = page.locator(".lp-panel .lp-fb");
  await expect(bars).toHaveCount(2);
  const second = bars.nth(1);
  const before = await boxes(second);
  const up = second.getByRole("button", { name: "Good answer" });
  const down = second.getByRole("button", { name: "Not helpful" });
  await up.click();
  await expect(up).toHaveAttribute("aria-pressed", "true");
  await expect(second.getByRole("status")).toHaveText("Thanks");
  expect(st.posts.at(-1)).toMatchObject({ kind: "chat", thread_id: 1, message_index: 1, rating: "up", note: "", starts_with: "Keep the Nami until you can afford the b" });
  // The vote can be changed; the first answer's own bar is untouched.
  await down.click();
  await expect(down).toHaveAttribute("aria-pressed", "true");
  await expect(up).toHaveAttribute("aria-pressed", "false");
  expect(st.posts.at(-1)).toMatchObject({ message_index: 1, rating: "down" });
  await expect(bars.nth(0).getByRole("button", { pressed: true })).toHaveCount(0);
  // Nothing moved: not the buttons, not the status.
  expect(await boxes(second)).toEqual(before);
  // Hit targets: at least 36px, 44px on a touch screen.
  const touch = await page.evaluate(() => matchMedia("(pointer: coarse)").matches);
  for (const [, , w, h] of before) expect(Math.min(w!, h!)).toBeGreaterThanOrEqual(touch ? 44 : 36);
});

test("'This is wrong' opens a note form below the buttons; Escape closes it; Send saves the note (#679)", async ({ page }) => {
  const st = await fake(page);
  await openPanel(page);
  const bar = page.locator(".lp-panel .lp-fb").nth(1);
  const wrong = bar.getByRole("button", { name: "This is wrong" });
  const before = await boxes(bar);
  await wrong.click();
  const note = bar.getByRole("textbox", { name: /What was wrong/ });
  await expect(note).toBeFocused();
  await expect(wrong).toHaveAttribute("aria-expanded", "true");
  expect(await boxes(bar)).toEqual(before);
  // The form sits below the buttons.
  const [formTop, barTop] = [(await bar.locator(".lp-fb-form").boundingBox())!.y, (await bar.boundingBox())!.y];
  expect(formTop - barTop).toBeGreaterThanOrEqual(before[0]![1]! + before[0]![3]!);
  expect(await note.getAttribute("maxlength")).toBe("1000");
  await page.keyboard.press("Escape");
  await expect(note).toHaveCount(0);
  await expect(wrong).toBeFocused();
  await expect(page.locator(".lp-panel")).toBeVisible();
  // Open again by keyboard, write, send.
  await page.keyboard.press("Enter");
  await note.fill("The Nami costs 4, not 3.");
  await bar.getByRole("button", { name: "Send" }).click();
  await expect(bar.getByRole("status")).toHaveText("Thanks");
  await expect(note).toHaveCount(0);
  await expect(wrong).toHaveAttribute("aria-pressed", "true");
  await expect(wrong).toBeFocused();
  expect(st.posts.at(-1)).toMatchObject({ kind: "chat", message_index: 1, rating: "wrong", note: "The Nami costs 4, not 3." });
  expect(await boxes(bar)).toEqual(before);
});

test("a rating that can't be sent says so, keeps the note and marks nothing (#679)", async ({ page }) => {
  await fake(page, { failPost: 500 });
  await openPanel(page);
  const bar = page.locator(".lp-panel .lp-fb").nth(0);
  await bar.getByRole("button", { name: "Good answer" }).click();
  await expect(bar.getByRole("alert")).toHaveText("Couldn't send that. Try again in a moment.");
  await expect(bar.getByRole("button", { name: "Good answer" })).toHaveAttribute("aria-pressed", "false");
  await bar.getByRole("button", { name: "This is wrong" }).click();
  await bar.getByRole("textbox", { name: /What was wrong/ }).fill("keep this");
  await bar.getByRole("button", { name: "Send" }).click();
  await expect(bar.getByRole("alert")).toBeVisible();
  await expect(bar.getByRole("textbox", { name: /What was wrong/ })).toHaveValue("keep this");
});

test("the player's earlier votes come back selected after a reload (#679)", async ({ page }) => {
  await fake(page, { votes: [{ kind: "chat", rating: "wrong", note: "Nope.", thread_id: 1, message_index: 0, match_id: null }, { kind: "chat", rating: "up", note: "", thread_id: 1, message_index: 1, match_id: null }] });
  await openPanel(page);
  const bars = page.locator(".lp-panel .lp-fb");
  await expect(bars.nth(0).getByRole("button", { name: "This is wrong" })).toHaveAttribute("aria-pressed", "true");
  await expect(bars.nth(1).getByRole("button", { name: "Good answer" })).toHaveAttribute("aria-pressed", "true");
  await expect(bars.nth(1).getByRole("status")).toHaveText("Thanks");
  // Opening the form on a 'wrong' vote starts from its note.
  await bars.nth(0).getByRole("button", { name: "This is wrong" }).click();
  await expect(bars.nth(0).getByRole("textbox", { name: /What was wrong/ })).toHaveValue("Nope.");
});
