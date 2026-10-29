/**
 * Tab rows on the shared Headless UI Tabs (#719): the admin sections and the lobby's Create / Join row.
 * Real arrow keys, Home / End and focus. The FastAPI backend is faked in the browser, and the admin
 * is a fake account (no production sign-in). Runs at desktop-1280 and phone-375.
 */
import { expect, test, FAKE_API, seedDecks, signInAs } from "./fixtures";

const ADMIN = { uid: 1, name: "boss" };

test("Admin sections: arrows, Home and End move between tabs and each tab shows its own panel (#719)", async ({ page }) => {
  await signInAs(page, ADMIN);
  await page.route(`${FAKE_API}/admin/**`, (route) => {
    const path = new URL(route.request().url()).pathname;
    if (path === "/admin/me") return route.fulfill({ json: { role: "admin", can: { analytics: true, set_roles: true, ban: true, delete: true } } });
    if (path === "/admin/hosting") return route.fulfill({ json: { vercel: { configured: false }, render: { configured: false }, github: { configured: false } } });
    if (path === "/admin/users") return route.fulfill({ json: { total: 0, users: [] } });
    if (path === "/admin/reports") return route.fulfill({ json: { reports: [] } });
    return route.fulfill({ status: 500, json: { detail: "faked failure" } });
  });
  await page.goto("/admin");
  const list = page.getByRole("tablist", { name: "Admin sections" });
  const tab = (name: string) => list.getByRole("tab", { name });
  await expect(tab("Players")).toHaveAttribute("aria-selected", "true");
  await expect(page.getByRole("tabpanel")).toContainText("Could not load this tab");

  // A mouse click draws no focus ring; keyboard focus does.
  await tab("Hosting").click();
  await expect(tab("Hosting")).toBeFocused();
  await expect(tab("Hosting")).toHaveCSS("outline-style", "none");
  await tab("Players").click();
  await tab("Players").focus();
  await page.keyboard.press("ArrowRight");
  await expect(tab("Bots & Log Pose")).not.toHaveCSS("outline-style", "none");
  await expect(tab("Bots & Log Pose")).toBeFocused();
  await expect(tab("Bots & Log Pose")).toHaveAttribute("aria-selected", "true");
  await expect(tab("Players")).toHaveAttribute("aria-selected", "false");

  await page.keyboard.press("End");
  await expect(tab("Users")).toHaveAttribute("aria-selected", "true");
  await expect(page.getByRole("tabpanel")).not.toContainText("Could not load this tab");
  await expect(page.getByRole("tabpanel")).toHaveAccessibleName("Users");

  await page.keyboard.press("ArrowLeft");
  await expect(tab("Reports")).toHaveAttribute("aria-selected", "true");
  await page.keyboard.press("ArrowLeft");
  await expect(tab("Event")).toHaveAttribute("aria-selected", "true");
  await page.keyboard.press("ArrowLeft");
  await expect(tab("Hosting")).toHaveAttribute("aria-selected", "true");
  await page.keyboard.press("Home");
  await expect(tab("Players")).toHaveAttribute("aria-selected", "true");
  // Only the selected tab is in the Tab order.
  await expect(tab("Hosting")).toHaveAttribute("tabindex", "-1");
  // The tab row never makes the page scroll sideways.
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
});

test("Lobby private room: the Create / Join row follows arrow keys and swaps the form (#719)", async ({ page }) => {
  await page.route(`${FAKE_API}/**`, (route) => {
    const path = new URL(route.request().url()).pathname;
    if (path === "/health") return route.fulfill({ json: { ok: true } });
    return route.fulfill({ status: 404, json: { detail: "not in e2e fake API" } });
  });
  await seedDecks(page);
  await page.goto("/");
  await page.getByRole("button", { name: "Play", exact: true }).click();
  await page.getByRole("dialog").getByRole("button", { name: /^Private room/ }).click();
  const row = page.getByRole("tablist", { name: "Private room" });
  await expect(row.getByRole("tab", { name: "Create" })).toHaveAttribute("aria-selected", "true");
  await expect(page.getByRole("button", { name: "Create room" })).toBeVisible();

  await row.getByRole("tab", { name: "Create" }).focus();
  await page.keyboard.press("ArrowRight");
  await expect(row.getByRole("tab", { name: "Join" })).toBeFocused();
  await expect(row.getByRole("tab", { name: "Join" })).toHaveAttribute("aria-selected", "true");
  await expect(page.getByLabel("Room id")).toBeVisible();
  await expect(page.getByRole("button", { name: "Join room" })).toBeVisible();

  await page.keyboard.press("Home");
  await expect(row.getByRole("tab", { name: "Create" })).toHaveAttribute("aria-selected", "true");
  await expect(page.getByRole("button", { name: "Create room" })).toBeVisible();
});
