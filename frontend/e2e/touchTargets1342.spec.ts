import type { Page } from "@playwright/test";
import { expect, test } from "./fixtures";

test.afterEach(({ planner }) => {
  expect(planner.errors).toEqual([]);
});

/**
 * Hit area of every visible control in the card list and its toolbar. A control's hit area is its own box plus the box
 * of its absolutely positioned ::after (the hit-slop the styles add); we read both from computed style, so the
 * check does not depend on what sits on top of the control at one sample point.
 */
async function smallControls(page: Page) {
  return page.evaluate(() => {
    type Box = { l: number; t: number; r: number; b: number };
    const root = document.querySelector(".card-workspace");
    if (!root) return { small: ["no .card-workspace"], overlapping: [] as string[], count: 0 };
    const controls = [...root.querySelectorAll<HTMLElement>("button, a[href], input:not([type=hidden]), select, [role=button]")].filter((e) => {
      const r = e.getBoundingClientRect();
      const cs = getComputedStyle(e);
      return r.width > 1 && r.height > 1 && cs.visibility !== "hidden" && cs.display !== "none" && e.offsetParent !== null && !e.closest("[aria-hidden=true]");
    });
    const hitBox = (e: HTMLElement): Box => {
      const r = e.getBoundingClientRect();
      const box: Box = { l: r.left, t: r.top, r: r.right, b: r.bottom };
      const ps = getComputedStyle(e, "::after");
      if (ps.content !== "none" && ps.position === "absolute") {
        const cs = getComputedStyle(e);
        const m = new DOMMatrix(ps.transform === "none" ? undefined : ps.transform);
        const left = r.left + parseFloat(cs.borderLeftWidth) + (parseFloat(ps.left) || 0) + m.m41;
        const top = r.top + parseFloat(cs.borderTopWidth) + (parseFloat(ps.top) || 0) + m.m42;
        box.l = Math.min(box.l, left);
        box.t = Math.min(box.t, top);
        box.r = Math.max(box.r, left + parseFloat(ps.width));
        box.b = Math.max(box.b, top + parseFloat(ps.height));
      }
      return box;
    };
    const name = (e: HTMLElement) => `${e.tagName.toLowerCase()}.${[...e.classList].join(".")} "${(e.getAttribute("aria-label") || e.textContent || "").trim().slice(0, 30)}"`;
    const boxes = controls.map((e) => ({ e, box: hitBox(e) }));
    const small = boxes.filter(({ box }) => box.r - box.l < 43.5 || box.b - box.t < 43.5).map(({ e, box }) => `${name(e)} ${Math.round(box.r - box.l)}x${Math.round(box.b - box.t)}`);
    const overlapping: string[] = [];
    for (const a of boxes) {
      for (const b of boxes) {
        if (a.e === b.e || a.e.contains(b.e) || b.e.contains(a.e)) continue;
        const r = b.e.getBoundingClientRect();
        const cx = r.left + r.width / 2;
        const cy = r.top + r.height / 2;
        if (cx > a.box.l && cx < a.box.r && cy > a.box.t && cy < a.box.b) overlapping.push(`${name(a.e)} covers the centre of ${name(b.e)}`);
      }
    }
    return { small, overlapping, count: controls.length };
  });
}

/** Visible text in the list smaller than 12px. */
async function tinyText(page: Page) {
  return page.evaluate(() => {
    const root = document.querySelector(".card-workspace");
    if (!root) return ["no .card-workspace"];
    const out = new Set<string>();
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    for (let n = walker.nextNode(); n; n = walker.nextNode()) {
      const text = (n.textContent ?? "").trim();
      const el = n.parentElement;
      if (!text || !el || el.offsetParent === null) continue;
      const r = el.getBoundingClientRect();
      if (r.width <= 1 || r.height <= 1 || getComputedStyle(el).visibility === "hidden") continue;
      const size = parseFloat(getComputedStyle(el).fontSize);
      if (size < 12) out.add(`${size}px ${el.tagName.toLowerCase()}.${[...el.classList].join(".")} "${text.slice(0, 24)}"`);
    }
    return [...out];
  });
}

async function setView(page: Page, layout: "list" | "grid", density: "compact" | "comfortable") {
  await page.addInitScript(([l, d]) => {
    localStorage.setItem("optcg_card_layout", l);
    for (const k of ["shopping", "collection", "deck"]) localStorage.setItem(`optcg_list_density_${k}`, d);
  }, [layout, density]);
}

const VIEWS = [
  ["list", "comfortable"],
  ["list", "compact"],
  ["grid", "compact"],
] as const;

for (const [layout, density] of VIEWS) {
  for (const path of ["/shopping", "/collection"]) {
    test(`phone ${path} ${layout} ${density}: every control has a 44px hit area and no text is under 12px (#1342)`, async ({ page, planner }, info) => {
      test.skip(info.project.name !== "phone-375", "touch layout");
      await setView(page, layout, density);
      await planner.open(path);
      await expect(page.locator(".card-workspace").getByRole("button", { name: /Filters/ })).toBeVisible();
      if (density === "compact" && layout === "list") {
        for (const chip of await page.locator(".mobile-card .alt-chip").all()) await chip.click();
      }
      await page.waitForTimeout(300);
      const { small, overlapping, count } = await smallControls(page);
      expect(count).toBeGreaterThan(10);
      expect(small, `hit areas under 44px:\n${small.join("\n")}`).toEqual([]);
      expect(overlapping, overlapping.join("\n")).toEqual([]);
      const tiny = await tinyText(page);
      expect(tiny, `text under 12px:\n${tiny.join("\n")}`).toEqual([]);
    });
  }
}
