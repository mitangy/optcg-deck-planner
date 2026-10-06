/**
 * "Report a problem" (#371): reachable from the match HUD (the ⋯ menu on phones,
 * a header button on desktop), opens over the board without leaving the match,
 * and posts the page, build context and message.
 */
import type { Page } from "@playwright/test";
import { test, expect, FAKE_API } from "./fixtures";

async function openReport(page: Page): Promise<void> {
  const menu = page.getByRole("button", { name: "Match menu" });
  if (await menu.isVisible()) {
    await menu.click();
    await page.getByRole("menuitem", { name: "Report a problem" }).click();
  } else {
    await page.getByRole("button", { name: "Report a problem" }).click();
  }
}

test("Report a problem sends the message from inside a demo match (#371)", async ({ page, duel }) => {
  const posted: Record<string, unknown>[] = [];
  await page.route(`${FAKE_API}/feedback`, async (route) => {
    posted.push(route.request().postDataJSON() as Record<string, unknown>);
    await route.fulfill({ status: 201, json: { id: 1 } });
  });
  await page.goto("/demo");
  await page.locator(".board-root").waitFor();
  await openReport(page);

  const dialog = page.getByRole("dialog", { name: "Report a problem" });
  await expect(dialog).toBeVisible();
  const text = dialog.getByRole("textbox", { name: "Message" });
  await expect(text).toBeFocused();
  // Nothing sits above the dialog's text box (board and prompts stack below).
  expect(await text.evaluate((el) => el.contains(document.elementFromPoint(el.getBoundingClientRect().x + 8, el.getBoundingClientRect().y + 8)))).toBe(true);

  await dialog.getByRole("button", { name: "Send" }).click();
  await expect(dialog.getByRole("alert")).toContainText("at least 10 characters");
  expect(posted).toEqual([]);

  await dialog.getByRole("radio", { name: "Idea" }).click();
  await text.fill("The end turn button is hard to find on my phone.");
  await dialog.getByRole("button", { name: "Send" }).click();
  await expect(dialog.getByText("Thanks, we got it.")).toBeVisible();
  expect(posted).toHaveLength(1);
  expect(posted[0]).toMatchObject({
    kind: "idea",
    app: "duel",
    page: "/demo",
    message: "The end turn button is hard to find on my phone.",
  });

  await dialog.getByRole("button", { name: "Close" }).click();
  await expect(dialog).toHaveCount(0);
  await expect(page).toHaveURL(/\/demo$/);
  await expect(page.locator(".board-root")).toBeVisible();
  expect(duel.errors).toEqual([]);
});

test("a failed send keeps the text and Escape closes the dialog (#371)", async ({ page }) => {
  await page.route(`${FAKE_API}/feedback`, (route) => route.fulfill({ status: 429, json: { detail: "slow down" } }));
  await page.goto("/demo");
  await page.locator(".board-root").waitFor();
  await openReport(page);
  const dialog = page.getByRole("dialog", { name: "Report a problem" });
  const text = dialog.getByRole("textbox", { name: "Message" });
  await text.fill("Something went wrong with the counter step.");
  await dialog.getByRole("button", { name: "Send" }).click();
  await expect(dialog.getByRole("alert")).toContainText("You've sent a lot of feedback");
  await expect(text).toHaveValue("Something went wrong with the counter step.");
  await page.keyboard.press("Escape");
  await expect(dialog).toHaveCount(0);
});
