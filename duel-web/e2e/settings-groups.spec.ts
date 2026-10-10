/**
 * Settings groups (#496): the Gameplay settings are headed groups (Turns and prompts, Hand, Board and layout,
 * Visual aids, Animations, Sound and alerts) with jump chips. In the in-match sheet the chip row stays at the top
 * while the groups scroll under it; the Settings page puts the look panels under one Appearance heading.
 * Desktop runs 1280x720; the phone project runs portrait 375x812 and landscape 812x375.
 * SETTINGS_GROUPS_SHOTS=<dir> also saves screenshots there.
 */
import { test, expect } from "./fixtures";
import type { Page } from "@playwright/test";

const SHOT_DIR = process.env.SETTINGS_GROUPS_SHOTS ?? "";

const SIZES = [
  { project: "desktop-1280", name: "desktop-1280x720", width: 1280, height: 720 },
  { project: "phone-375", name: "phone-375x812", width: 375, height: 812 },
  { project: "phone-375", name: "phone-812x375-landscape", width: 812, height: 375 },
];

const TITLES = ["Turns and prompts", "Hand", "Board and layout", "Visual aids", "Animations", "Sound and alerts"];

async function shot(page: Page, name: string) {
  if (SHOT_DIR) await page.screenshot({ path: `${SHOT_DIR}/${name}.png` });
}

async function expectNoSidewaysScroll(page: Page) {
  const wide = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  expect(wide).toBeLessThanOrEqual(0);
}

for (const size of SIZES) {
  test.describe(size.name, () => {
    test.beforeEach(({}, info) => {
      test.skip(info.project.name !== size.project, `${size.name} runs in ${size.project}`);
    });

    test("the in-match sheet lists the groups, and a chip jumps to its group under the sticky chip row (#496)", async ({ page }) => {
      await page.setViewportSize({ width: size.width, height: size.height });
      await page.goto("/demo?full");
      await page.locator(".board-root").waitFor();
      await page.waitForTimeout(300);
      // The desktop bar has a ⚙ button; phones reach it through the ⋯ match menu.
      const gear = page.getByRole("button", { name: "Gameplay settings" });
      if (await gear.count()) await gear.click();
      else {
        await page.getByRole("button", { name: "Match menu" }).click();
        await page.getByRole("menuitem", { name: /Gameplay settings/ }).click();
      }
      const sheet = page.getByRole("dialog", { name: "Gameplay settings" });
      await expect(sheet).toBeVisible();
      for (const title of TITLES) await expect(sheet.getByRole("heading", { name: title, level: 3 })).toHaveCount(1);
      const nav = sheet.getByRole("navigation", { name: "Gameplay sections" });
      await expect(nav.getByRole("button")).toHaveCount(6);
      await expect(sheet.getByText("Show on screen")).toHaveCount(1);
      await page.waitForTimeout(250);
      await shot(page, `sheet-top-${size.name}`);

      // Each chip hits at least 36px.
      for (const b of await nav.getByRole("button").all()) expect((await b.boundingBox())!.height).toBeGreaterThanOrEqual(35);

      await nav.getByRole("button", { name: "Sound" }).click();
      const heading = sheet.getByRole("heading", { name: "Sound and alerts" });
      // Smooth scrolling settles on its own; wait for the heading to stop moving.
      await expect
        .poll(async () => {
          const a = (await heading.boundingBox())!.y;
          await page.waitForTimeout(120);
          return Math.abs(a - (await heading.boundingBox())!.y) < 0.5;
        })
        .toBe(true);
      const sheetBox = (await sheet.boundingBox())!;
      const navBox = (await nav.boundingBox())!;
      const headBox = (await heading.boundingBox())!;
      // The chip row is still at the top of the sheet, and the heading is in view just under it (not hidden behind it).
      expect(navBox.y).toBeGreaterThanOrEqual(sheetBox.y - 1);
      expect(navBox.y).toBeLessThanOrEqual(sheetBox.y + 6);
      expect(headBox.y).toBeGreaterThanOrEqual(navBox.y + navBox.height - 1);
      expect(headBox.y + headBox.height).toBeLessThanOrEqual(sheetBox.y + sheetBox.height + 1);
      await shot(page, `sheet-sound-${size.name}`);
      await expectNoSidewaysScroll(page);
    });

    test("Settings groups the look panels under Appearance and the jump links follow the new order (#496)", async ({ page }) => {
      await page.setViewportSize({ width: size.width, height: size.height });
      await page.goto("/settings");
      await page.locator("#account").waitFor();
      const jump = page.getByRole("navigation", { name: "Jump to a section" });
      await expect(jump.getByRole("link")).toHaveText(["Account", "Gameplay", "Appearance", "Deck editor", "About"]);
      const appearance = page.locator("#appearance");
      await expect(appearance.getByRole("heading", { name: "Appearance", level: 2 })).toBeVisible();
      for (const id of ["theme", "playmat", "card-back", "don-card"]) await expect(appearance.locator(`#${id}`)).toHaveCount(1);
      await expect(page.locator("#gameplay").getByRole("navigation", { name: "Gameplay sections" })).toBeVisible();
      for (const title of TITLES) await expect(page.locator("#gameplay").getByRole("heading", { name: title, level: 3 })).toHaveCount(1);

      if (size.project === "desktop-1280") {
        // Wide: Gameplay on the right, Appearance on the left under Account.
        const a = (await appearance.boundingBox())!;
        const g = (await page.locator("#gameplay").boundingBox())!;
        const acc = (await page.locator("#account").boundingBox())!;
        expect(g.x).toBeGreaterThan(a.x + a.width - 2);
        expect(a.y).toBeGreaterThanOrEqual(acc.y + acc.height - 1);
      }
      await expectNoSidewaysScroll(page);
      await shot(page, `settings-page-${size.name}`);
      await page.locator("#gameplay").getByRole("button", { name: "Sound" }).click();
      await page.waitForTimeout(700);
      await shot(page, `settings-page-sound-${size.name}`);
      await expectNoSidewaysScroll(page);
    });
  });
}
