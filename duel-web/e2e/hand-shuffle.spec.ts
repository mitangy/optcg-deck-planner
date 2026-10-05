/**
 * Rearranging your hand animates (#338): Sort riffles the cards into their
 * new order, and a card dropped on a new spot lands with a settle while the
 * cards it pushed slide over. "Card animations: Off" keeps the hand still.
 */
import type { Page } from "@playwright/test";
import { test, expect } from "./fixtures";

const HAND =
  ".hand-fan-cards, .hand-row-inner, .rail-hand-cards, .hand-dock-cards";
const CARDS = [
  ".hand-fan-cards",
  ".hand-row-inner",
  ".rail-hand-cards",
  ".hand-dock-cards",
]
  .map((s) => `${s} > .card-tile`)
  .join(", ");

type Anim = { id: string; kf: string };

/** Log every Web Animation started on a hand card (id + keyframes). */
async function recordHandAnims(page: Page, settings: Record<string, unknown>) {
  await page.addInitScript(
    ([s, hand]) => {
      localStorage.setItem("optcg-duel:settings", JSON.stringify(s));
      const w = window as unknown as { __handAnims: Anim[] };
      w.__handAnims = [];
      const orig = Element.prototype.animate;
      Element.prototype.animate = function (this: Element, kf, opts) {
        const id = this.getAttribute("data-motion-id");
        if (id && this.parentElement?.matches(hand))
          w.__handAnims.push({ id, kf: JSON.stringify(kf) });
        return orig.call(this, kf, opts);
      };
    },
    [settings, HAND] as const,
  );
}

const anims = (page: Page) =>
  page.evaluate(
    () => (window as unknown as { __handAnims: Anim[] }).__handAnims,
  );
const clearAnims = (page: Page) =>
  page.evaluate(() => {
    (window as unknown as { __handAnims: Anim[] }).__handAnims = [];
  });

async function openDemo(page: Page) {
  await page.goto("/demo");
  await page.locator(".board-root").waitFor();
  // Let the opening draw animations finish, then start a clean log.
  await page.waitForTimeout(800);
  await clearAnims(page);
}

const order = (page: Page) =>
  page
    .locator(CARDS)
    .evaluateAll((els) => els.map((e) => e.getAttribute("data-motion-id")));

async function clickSort(page: Page) {
  await page
    .locator(".hand-rail-btn", { hasText: "Sort" })
    .locator("visible=true")
    .first()
    .click();
}

function handTests(where: string, landscape = false) {
  for (const handLayout of ["fan", "grid"]) {
    test(`${handLayout} hand${where}: Sort riffles the cards into their new order (#338)`, async ({
      page,
    }) => {
      if (landscape) {
        test.skip(test.info().project.name !== "phone-375", "phones only");
        await page.setViewportSize({ width: 812, height: 375 });
      }
      await recordHandAnims(page, { handLayout });
      await openDemo(page);
      const before = await order(page);
      await clickSort(page);
      await expect.poll(() => order(page)).not.toEqual(before);
      const after = await order(page);
      const moved = after.filter((id, i) => before[i] !== id);
      const riffled = (await anims(page))
        .filter((a) => a.kf.includes("rotate"))
        .map((a) => a.id);
      expect(riffled.length).toBeGreaterThan(0);
      // Every card that changed place hops; none that stayed put.
      expect(new Set(riffled)).toEqual(new Set(moved));
    });

    test(`${handLayout} hand${where}: a card dropped on a new spot lands and the others slide over (#338)`, async ({
      page,
    }) => {
      if (landscape) {
        test.skip(test.info().project.name !== "phone-375", "phones only");
        await page.setViewportSize({ width: 812, height: 375 });
      }
      await recordHandAnims(page, { handLayout });
      await openDemo(page);
      const cards = page.locator(CARDS);
      const [h1, h2, h3] = await order(page);
      const touch = test.info().project.name === "phone-375";
      const box = async (i: number) => (await cards.nth(i).boundingBox())!;
      let b = await box(0);
      if (!touch) {
        await page.mouse.move(b.x + b.width / 2, b.y + 12);
        await page.waitForTimeout(450);
        b = await box(0);
      }
      const start = { x: b.x + b.width / 2, y: b.y + b.height / 2 };
      const third = await box(2);
      const end = {
        x: third.x + third.width * 0.85,
        y: third.y + third.height / 2,
      };
      if (touch) {
        const cdp = await page.context().newCDPSession(page);
        await cdp.send("Input.dispatchTouchEvent", {
          type: "touchStart",
          touchPoints: [start],
        });
        // Lift the card a little first, across the row's scroll: the landscape rail scrolls up and down.
        const lift = landscape ? { x: start.x - 16, y: start.y } : { x: start.x, y: start.y - 16 };
        for (const p of [lift, { x: end.x, y: lift.y }, end]) {
          await cdp.send("Input.dispatchTouchEvent", {
            type: "touchMove",
            touchPoints: [p],
          });
          await page.waitForTimeout(30);
        }
        await cdp.send("Input.dispatchTouchEvent", {
          type: "touchEnd",
          touchPoints: [],
        });
      } else {
        await page.mouse.move(start.x, start.y);
        await page.mouse.down();
        await page.mouse.move(start.x, start.y - 14, { steps: 4 });
        await page.mouse.move(end.x, end.y, { steps: 10 });
        await page.mouse.up();
      }
      await expect
        .poll(async () => (await order(page)).slice(0, 3))
        .toEqual([h2, h3, h1]);
      const log = await anims(page);
      // The dropped card lands with a settle (scale); the two it passed slide back.
      expect(
        log.filter((a) => a.id === h1 && a.kf.includes("scale")),
      ).toHaveLength(1);
      expect(new Set(log.filter((a) => a.id !== h1).map((a) => a.id))).toEqual(
        new Set([h2, h3]),
      );
    });
  }
}

handTests("", false);

// Landscape phones keep the hand in the corner dock.
handTests(" on a landscape phone", true);

test("Card animations Off keeps the hand still when sorting (#338)", async ({
  page,
}) => {
  await recordHandAnims(page, { animationSpeed: "off" });
  await openDemo(page);
  const before = await order(page);
  await clickSort(page);
  await expect.poll(() => order(page)).not.toEqual(before);
  await page.waitForTimeout(200);
  expect(await anims(page)).toEqual([]);
});
