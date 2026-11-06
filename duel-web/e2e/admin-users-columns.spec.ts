/**
 * Admin Users tab column titles (#1018): "Source" used to run into "Rkd" because the Source column
 * collapsed to nothing while its title kept its width. At every width the titles must stay inside their
 * own column and the rows must not scroll sideways. The FastAPI backend is faked in the browser and the
 * admin is a fake account (no production sign-in).
 */
import { expect, test, FAKE_API, signInAs } from "./fixtures";

const GAMES = { ranked: 120, friends: 34, private: 5, bot: 1200, practice: 9 };
const USERS = [
  {
    id: 11, email: "a-rather-long-email-address-for-layout@example.com", name: "Monkey D. Luffy", username: "straw_hat_captain", role: "user",
    created_at: "2026-10-01T10:00:00Z", banned_at: null, ban_reason: null,
    signup_source: { ref: "https://www.reddit.com/r/OnePieceTCG/comments/abc/some_long_thread", utm_source: "reddit", utm_medium: "social", utm_campaign: "launch" },
    matches: 159, last_match_at: "2026-11-01T10:00:00Z", games: GAMES,
  },
  {
    id: 12, email: "zoro@example.com", name: "Zoro", username: null, role: "moderator",
    created_at: "2026-10-02T10:00:00Z", banned_at: null, ban_reason: null,
    signup_source: {}, matches: 0, last_match_at: null, games: { ranked: 0, friends: 0, private: 0, bot: 3, practice: 0 },
  },
  {
    id: 13, email: "nami@example.com", name: "Nami", username: "nami", role: "user",
    created_at: "2026-10-03T10:00:00Z", banned_at: null, ban_reason: null,
    signup_source: null, matches: 2, last_match_at: null, games: { ranked: 1, friends: 1, private: 0, bot: 0, practice: 0 },
  },
];

test("admin Users column titles do not overlap (#1018)", async ({ page }) => {
  await signInAs(page, { uid: 1, name: "boss" });
  await page.route(`${FAKE_API}/admin/**`, (route) => {
    const path = new URL(route.request().url()).pathname;
    if (path === "/admin/me") return route.fulfill({ json: { role: "admin", can: { analytics: true, set_roles: true, ban: true, delete: true } } });
    if (path === "/admin/users") return route.fulfill({ json: { total: USERS.length, users: USERS } });
    return route.fulfill({ status: 500, json: { detail: "faked failure" } });
  });
  await page.goto("/admin");
  await page.getByRole("tab", { name: "Users", exact: true }).click();
  await expect(page.locator(".adm-urow:not(.adm-uhead)")).toHaveCount(USERS.length);

  for (const width of [1280, 1100, 1050, 1031, 1000, 900, 800, 700, 375]) {
    await page.setViewportSize({ width, height: 800 });
    const where = `at ${width}px wide`;
    const result = await page.evaluate(() => {
      const head = document.querySelector<HTMLElement>(".adm-uhead")!;
      const spans = [...head.children] as HTMLElement[];
      // The text's own box, so a title spilling past its column shows even when the span clips nothing.
      const texts = spans.map((s) => {
        const range = document.createRange();
        range.selectNodeContents(s);
        const r = range.getBoundingClientRect();
        const box = s.getBoundingClientRect();
        return { label: s.textContent ?? "", left: r.left, right: r.right, boxLeft: box.left, boxRight: box.right, over: s.scrollWidth - s.clientWidth };
      });
      const rows = [...document.querySelectorAll<HTMLElement>(".adm-urow")].map((r) => r.scrollWidth - r.clientWidth);
      return {
        headVisible: getComputedStyle(head).display !== "none",
        texts,
        rowOverflow: Math.max(...rows),
        pageOverflow: document.documentElement.scrollWidth - window.innerWidth,
      };
    });
    expect(result.rowOverflow, `a row scrolls sideways ${where}`).toBeLessThanOrEqual(1);
    expect(result.pageOverflow, `the page scrolls sideways ${where}`).toBeLessThanOrEqual(0);
    if (!result.headVisible) continue;
    result.texts.forEach((t, i) => {
      expect(t.over, `"${t.label}" is wider than its column ${where}`).toBeLessThanOrEqual(1);
      expect(t.right, `"${t.label}" runs past its column ${where}`).toBeLessThanOrEqual(t.boxRight + 1);
      const next = result.texts[i + 1];
      if (next) expect(t.right, `"${t.label}" runs into "${next.label}" ${where}`).toBeLessThanOrEqual(next.boxLeft + 1);
    });
  }
});
