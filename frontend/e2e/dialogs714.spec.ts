/**
 * Pop-ups on the shared Headless UI Dialog (#714): the deck stats sheet, the feedback dialog and the card
 * scanner with its camera. Real Tab, Escape and focus, and a Chromium fake camera whose tracks can be inspected.
 * Runs at desktop-1200 and phone-375.
 */
import type { Page } from "@playwright/test";
import { expect, test, DECK_ID } from "./fixtures";

test.use({
  launchOptions: {
    executablePath: process.env.PW_CHROMIUM_PATH || undefined,
    args: ["--use-fake-device-for-media-stream", "--use-fake-ui-for-media-stream"],
  },
});

test.afterEach(({ planner }) => {
  expect(planner.errors).toEqual([]);
});

/** Press Tab `n` times and check focus never leaves `dialog`. */
async function tabStaysInside(page: Page, dialog: ReturnType<Page["getByRole"]>, n: number, shift = false) {
  for (let i = 0; i < n; i++) {
    await page.keyboard.press(shift ? "Shift+Tab" : "Tab");
    expect(await dialog.evaluate((el) => el.contains(document.activeElement))).toBe(true);
  }
}

test("Tab stays inside the deck stats sheet and Escape hands focus back to the Stats pill (#714)", async ({ page, planner }) => {
  await planner.open(`/decks/${DECK_ID}`);
  await expect(page.getByRole("heading", { name: "Oden Red/Green", level: 1 })).toBeVisible();
  // On a wide screen the stats are a docked column; the pill and sheet appear while the editor uses that column.
  const edit = page.getByRole("button", { name: "Edit deck" });
  if (await page.locator(".stats-dock").count()) await edit.click();
  const pill = page.locator(".stats-pill");
  await pill.focus();
  await pill.press("Enter");
  const sheet = page.getByRole("dialog", { name: "Deck stats" });
  await expect(sheet).toBeVisible();
  expect(await sheet.evaluate((el) => el.contains(document.activeElement))).toBe(true);
  // More presses than the sheet has controls, so a leak would show.
  await tabStaysInside(page, sheet, 40);
  await tabStaysInside(page, sheet, 40, true);
  await page.keyboard.press("Escape");
  await expect(sheet).toHaveCount(0);
  await expect(pill).toBeFocused();
});

test("Tab stays inside the feedback dialog and Escape hands focus back to Send feedback (#714)", async ({ page, planner }) => {
  await planner.open("/");
  const opener = page.getByRole("button", { name: "Send feedback" });
  await opener.focus();
  await opener.press("Enter");
  const dialog = page.getByRole("dialog", { name: "Send feedback" });
  await expect(dialog.getByRole("textbox", { name: "Message" })).toBeFocused();
  await tabStaysInside(page, dialog, 12);
  await tabStaysInside(page, dialog, 12, true);
  await page.keyboard.press("Escape");
  await expect(dialog).toHaveCount(0);
  await expect(opener).toBeFocused();
});

test("Escape steps back out of the camera, which stops, and a second Escape closes the scanner (#714)", async ({ page, planner }) => {
  // Remember every stream the page opens so its tracks can be inspected after the camera closes.
  await page.addInitScript(() => {
    const w = window as unknown as { __streams: MediaStream[] };
    w.__streams = [];
    const real = navigator.mediaDevices.getUserMedia.bind(navigator.mediaDevices);
    navigator.mediaDevices.getUserMedia = async (c) => {
      const s = await real(c);
      w.__streams.push(s);
      return s;
    };
  });
  // Scan data "ready" with an empty descriptor set, so the camera button is enabled.
  await page.route("**/scan-data/descriptors.manifest.json", (r) =>
    r.fulfill({ json: { formatVersion: "1", features: 0, totalRecords: 0, totalBytes: 0, chunks: [] } }),
  );
  await planner.open("/");
  await page.locator(".scan-open").first().click();
  const scanner = page.getByRole("dialog", { name: "Scan a card" });
  await scanner.getByRole("button", { name: "Scan with camera" }).click();
  const camera = page.getByRole("dialog", { name: "Scan with camera" });
  await expect(page.getByRole("button", { name: "Capture" })).toBeEnabled();
  const live = () => page.evaluate(() => (window as unknown as { __streams: MediaStream[] }).__streams.flatMap((s) => s.getTracks()).filter((t) => t.readyState === "live").length);
  expect(await live()).toBe(1);
  // Nothing can Tab out to the scanner or the page under the camera.
  await tabStaysInside(page, camera, 6);

  await page.keyboard.press("Escape");
  await expect(camera).toHaveCount(0);
  await expect(scanner).toBeVisible();
  expect(await live()).toBe(0);
  await expect(scanner.getByRole("button", { name: "Scan with camera" })).toBeFocused();

  await page.keyboard.press("Escape");
  await expect(scanner).toHaveCount(0);
});
