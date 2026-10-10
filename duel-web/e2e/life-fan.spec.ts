/**
 * Life stack direction (#499): your Life fans down or up by setting, and the
 * opponent's fans the other way so the two mirror across the midline.
 */
import { test, expect } from "./fixtures";
import type { Page } from "@playwright/test";

async function openDemo(page: Page, settings: Record<string, unknown>) {
  await page.addInitScript((s) => localStorage.setItem("optcg-duel:settings", JSON.stringify(s)), settings);
  await page.goto("/demo");
  await page.locator(".board-root").waitFor();
}

/** Where the top card (last face, drawn in front) sits against the bottom of the fan. */
async function topCardIs(page: Page, side: "you" | "opp"): Promise<"above" | "below"> {
  const faces = page.locator(`.side-${side} .zone-pile-life .zone-pile-face`);
  await expect(faces.first()).toBeVisible();
  expect(await faces.count()).toBeGreaterThan(1);
  const first = (await faces.first().boundingBox())!;
  const last = (await faces.last().boundingBox())!;
  return last.y < first.y ? "above" : "below";
}

test("Life fans down on your mat and up on the opponent's by default (#499)", async ({ page }, info) => {
  await openDemo(page, {});
  expect(await topCardIs(page, "you")).toBe("below");
  // Portrait phones draw the opponent's mat as a count row, with no faces.
  if (await page.locator(".side-opp .zone-pile-life").count()) expect(await topCardIs(page, "opp")).toBe("above");
  else expect(info.project.name).toBe("phone-375");
});

test("Fans up puts the top Life card at the top on your mat and the opponent's fans down (#499)", async ({ page }, info) => {
  await openDemo(page, { lifeFan: "up" });
  expect(await topCardIs(page, "you")).toBe("above");
  if (await page.locator(".side-opp .zone-pile-life").count()) expect(await topCardIs(page, "opp")).toBe("below");
  else expect(info.project.name).toBe("phone-375");
});
