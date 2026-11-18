import { test, expect } from "./fixtures";
import type { Locator, Page } from "@playwright/test";

test.use({ legacyLayout: false });

const phoneOnly = () => test.skip(test.info().project.name !== "phone-375", "touch phone layout");

async function openDemo(page: Page, query: string, size: { width: number; height: number }) {
  await page.setViewportSize(size);
  await page.goto(`/demo${query}`);
  await page.locator(".board-root").waitFor();
  await page.waitForTimeout(500);
}

// A centred pseudo-element hit area is not in getBoundingClientRect, so walk up and down from the middle and measure how far a finger still lands on the control.
async function tapHeight(el: Locator): Promise<number> {
  return el.evaluate((node) => {
    const r = node.getBoundingClientRect();
    const x = r.left + r.width / 2;
    const cy = r.top + r.height / 2;
    const hits = (y: number) => {
      const at = document.elementFromPoint(x, y);
      return !!at && node.contains(at);
    };
    let up = 0;
    while (up < 60 && hits(cy - up - 1)) up += 1;
    let down = 0;
    while (down < 60 && hits(cy + down + 1)) down += 1;
    return up + down + 1;
  });
}

test("phone portrait: the controls a thumb needs have a 44px hit area (#1343)", async ({ page }) => {
  phoneOnly();
  await openDemo(page, "?full&chat", { width: 375, height: 812 });
  const menu = page.getByRole("button", { name: "Match menu" }).first();
  const m = (await menu.boundingBox())!;
  expect(m.width).toBeGreaterThanOrEqual(44);
  expect(m.height).toBeGreaterThanOrEqual(44);
  for (const [name, loc] of [
    ["Sort", page.locator(".hand-sort-btn")],
    ["Hide hand", page.locator(".hand-collapse-btn")],
    ["Rotate hint close", page.locator(".rotate-hint-close")],
  ] as const) {
    await expect(loc, name).toBeVisible();
    expect(await tapHeight(loc), `${name} answers taps over 44px of height`).toBeGreaterThanOrEqual(44);
  }
});

test("phone portrait: the Battle log and Chat pills stay off the opponent's mat (#1343)", async ({ page }) => {
  phoneOnly();
  await openDemo(page, "?full&chat", { width: 375, height: 812 });
  const mat = (await page.locator(".side-opp").boundingBox())!;
  for (const loc of [page.locator(".battle-log-toggle").first(), page.locator(".chat-toggle")]) {
    const box = (await loc.boundingBox())!;
    expect(box.y + box.height).toBeLessThanOrEqual(mat.y + 0.5);
  }
});

test("phone portrait: board captions and chips reach 12px (#1343)", async ({ page }) => {
  phoneOnly();
  await openDemo(page, "?full", { width: 375, height: 812 });
  const sizes = await page.evaluate(() => {
    const px = (sel: string) => [...document.querySelectorAll(sel)].filter((e) => e.getBoundingClientRect().width > 0).map((e) => parseFloat(getComputedStyle(e).fontSize));
    return {
      turnChip: px(".hud-turn-chip"),
      order: px(".mat-order"),
      don: px(".don-strip-label, .don-strip-nums"),
      piles: px(".zone-pile-label"),
      handBtns: px(".hand-rail-btn"),
    };
  });
  for (const [what, list] of Object.entries(sizes)) {
    expect(list.length, what).toBeGreaterThan(0);
    for (const v of list) expect(v, `${what} font size`).toBeGreaterThanOrEqual(12);
  }
});

test("phone landscape: the DON!! area is a 44px tap target and the piles carry an icon (#1343)", async ({ page }) => {
  phoneOnly();
  await openDemo(page, "?full", { width: 812, height: 375 });
  const rail = page.locator(".side-you .don-strip-rail");
  const r = (await rail.boundingBox())!;
  expect(r.width).toBeGreaterThanOrEqual(44);
  expect(r.height).toBeGreaterThanOrEqual(44);

  await expect(page.locator(".side-you .don-chip-btn.is-selected")).toHaveCount(0);
  // Find a spot on the rail that is not a chip, and tap it like a thumb would.
  const spot = await rail.evaluate((el) => {
    const b = el.getBoundingClientRect();
    for (let y = b.top + 4; y < b.bottom - 2; y += 4) {
      for (let x = b.left + 4; x < b.right - 2; x += 4) {
        if (document.elementFromPoint(x, y) === el) return { x, y };
      }
    }
    return null;
  });
  expect(spot, "the rail has room between its chips").not.toBeNull();
  await page.touchscreen.tap(spot!.x, spot!.y);
  await expect(page.locator(".side-you .don-chip-btn.is-selected")).toHaveCount(1);
  await page.touchscreen.tap(spot!.x, spot!.y);
  await expect(page.locator(".side-you .don-chip-btn.is-selected")).toHaveCount(2);

  const icons = await page.evaluate(() => {
    const vis = (sel: string) => [...document.querySelectorAll(sel)].filter((e) => e.getBoundingClientRect().width >= 10).length;
    return { icons: vis(".side-you .zone-pile-meta .count-icon"), labelFont: parseFloat(getComputedStyle(document.querySelector(".side-you .don-strip-label")!).fontSize) };
  });
  expect(icons.icons, "Life, Deck, DON!! deck and Trash each show an icon").toBe(4);
  expect(icons.labelFont).toBeGreaterThanOrEqual(12);
});

test("phone match menu is grouped, with Concede and Leave at the bottom as danger rows (#1343)", async ({ page }) => {
  phoneOnly();
  await openDemo(page, "?full", { width: 375, height: 812 });
  await page.getByRole("button", { name: "Match menu" }).first().click();
  const menu = page.getByRole("menu", { name: "Match menu" });
  await expect(menu).toBeVisible();
  const rows = menu.getByRole("menuitem");
  const n = await rows.count();
  for (let i = 0; i < n; i += 1) {
    const b = (await rows.nth(i).boundingBox())!;
    expect(b.height, `menu item ${i} height`).toBeGreaterThanOrEqual(44);
  }
  const names = await rows.evaluateAll((els) => els.map((e) => e.getAttribute("aria-label") ?? (e.textContent ?? "").trim()));
  expect(names.slice(-2).map((t) => t.replace(/Tap again.*/, ""))).toEqual(["Concede", "Leave match"]);
  const exits = menu.locator(".match-menu-exits .match-menu-danger");
  await expect(exits).toHaveCount(2);

  const fs = menu.getByRole("menuitem", { name: "Full screen" });
  const mute = menu.getByRole("menuitem", { name: /^(Mute|Unmute) this tab$/ });
  const a = (await fs.boundingBox())!;
  const b = (await mute.boundingBox())!;
  expect(Math.abs(a.y - b.y), "Full screen and Mute share one row").toBeLessThanOrEqual(1);
  const exitTop = (await exits.first().boundingBox())!.y;
  expect(a.y + a.height, "the icon row is above the exits").toBeLessThan(exitTop);
});

const SIZES = [
  { name: "1280x720", width: 1280, height: 720 },
  { name: "375x812", width: 375, height: 812 },
  { name: "812x375", width: 812, height: 375 },
];

for (const prompt of ["look", "effects"]) {
  for (const size of SIZES) {
    test(`the ${prompt} pop-up dims the board, keeps its sentence in the header and clips nothing at ${size.name} (#1343)`, async ({ page }) => {
      await openDemo(page, `?prompt=${prompt}`, size);
      const layer = page.locator(".float-layer").first();
      await expect(layer).toBeVisible();

      // Half-strength scrim behind the cards that never catches a tap.
      const scrim = await layer.evaluate((el) => {
        const cs = getComputedStyle(el, "::before");
        return { bg: cs.backgroundColor, events: cs.pointerEvents };
      });
      const alpha = Number(scrim.bg.match(/rgba?\(([^)]+)\)/)![1]!.split(/[ ,/]+/).filter(Boolean)[3] ?? 1);
      expect(alpha).toBeGreaterThanOrEqual(0.4);
      expect(alpha).toBeLessThanOrEqual(0.6);
      expect(scrim.events).toBe("none");

      // The instruction lives in the header, and the side-dock bubble that used to repeat it is gone.
      await expect(page.locator(".float-head .float-prompt")).toBeVisible();
      await expect(page.locator(".dock-caption .prompt")).toHaveCount(0);

      // Nothing sticks out of the window: header, every card and the buttons.
      const boxes = await page.evaluate(() => {
        const sel = ".float-head, .float-card, .float-actions, .prompt-slot-row, .float-peek";
        return [...document.querySelectorAll(sel)]
          .map((e) => ({ cls: e.className.toString().slice(0, 30), r: e.getBoundingClientRect() }))
          .filter((o) => o.r.width > 0)
          .map((o) => ({ cls: o.cls, top: o.r.top, left: o.r.left, bottom: o.r.bottom, right: o.r.right }));
      });
      expect(boxes.length).toBeGreaterThan(3);
      for (const b of boxes) {
        expect(b.top, `${b.cls} top`).toBeGreaterThanOrEqual(-0.5);
        expect(b.left, `${b.cls} left`).toBeGreaterThanOrEqual(-0.5);
        expect(b.bottom, `${b.cls} bottom`).toBeLessThanOrEqual(size.height + 0.5);
        expect(b.right, `${b.cls} right`).toBeLessThanOrEqual(size.width + 0.5);
      }
    });
  }
}
