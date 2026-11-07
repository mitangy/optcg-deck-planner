/**
 * The four controls under the enlarged card (Card page, shopping list, Price alert, Price history)
 * are one width (#1034). Runs at desktop-1200 and phone-375.
 */
import { expect, test } from "./fixtures";

test.afterEach(({ planner }) => {
  expect(planner.errors).toEqual([]);
});

test("the enlarged card's four action controls are the same width, before and after Add (#1034)", async ({ page, planner }) => {
  await planner.open("/collection");
  await page.locator('[data-card-id="EB01-006"]:visible').getByTitle("Expand card").click();
  const lightbox = page.getByRole("dialog", { name: "Expanded card art" });
  await expect(lightbox).toContainText("Owned 3");
  const widths = async () => {
    const out: number[] = [];
    for (const sel of [".lightbox-card-link", ".shopping-extra-control", ".lightbox-alert", ".lightbox-history"]) {
      const box = await lightbox.locator(`.lightbox-action ${sel}`).boundingBox();
      expect(box, sel).not.toBeNull();
      out.push(box!.width);
    }
    return out;
  };
  const spread = (w: number[]) => Math.max(...w) - Math.min(...w);

  const idle = await widths();
  expect(spread(idle), `Add state widths ${idle.join(", ")}`).toBeLessThanOrEqual(1);

  await lightbox.getByRole("button", { name: "Add EB01-006 to shopping list" }).click();
  await expect(lightbox.locator(".deck-editor-qty")).toHaveText("1");
  const stepper = await widths();
  expect(spread(stepper), `Stepper state widths ${stepper.join(", ")}`).toBeLessThanOrEqual(1);
  expect(Math.abs(stepper[1] - idle[1])).toBeLessThanOrEqual(1);
});
