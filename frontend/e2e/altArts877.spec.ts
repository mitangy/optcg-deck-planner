/**
 * Alt arts in every card list (#877): desktop tables give them their own last column (like group buys),
 * grid cards in a row are as tall as the tallest one, and a card with many alts shows about five tiles
 * and scrolls the rest inside its own box. Runs at desktop-1200 and phone-375.
 */
import type { Locator, Page } from "@playwright/test";
import { expect, formatIssues, test, GROUP_BUY_ID } from "./fixtures";

test.afterEach(({ planner }) => {
  expect(planner.errors).toEqual([]);
});

const IZO = "EB01-002";
const KID = "EB01-003";

async function setLayout(page: Page, layout: "List" | "Grid") {
  await page.getByRole("group", { name: "Card layout" }).getByRole("button", { name: layout, exact: true }).click();
}

const LISTS = [
  { name: "Shopping", path: "/", others: [KID] },
  { name: "Collection", path: "/collection", others: ["EB01-001"] },
] as const;

for (const list of LISTS) {
  test(`${list.name} list puts alt arts in their own last column, right of the card, and fits (#877)`, async ({ page, planner }, testInfo) => {
    test.skip(testInfo.project.name !== "desktop-1200", "the table is desktop only");
    await planner.open(list.path);
    const table = page.locator(".desktop-table table");
    await expect(table.locator("thead th").last()).toHaveText("Alt arts");
    const geometry = await table.evaluate((t, ids) => {
      const rows = [...t.querySelectorAll("tbody tr")].filter((r) => ids.some((id) => r.textContent?.includes(id)));
      const wrap = t.parentElement!;
      return {
        fits: wrap.scrollWidth <= wrap.clientWidth,
        rows: rows.map((r) => {
          const cells = [...r.children] as HTMLElement[];
          const last = cells[cells.length - 1];
          const card = r.querySelector(".card-cell")!;
          return {
            text: r.textContent ?? "",
            lastIsAlt: last.classList.contains("alt-arts-cell"),
            tilesInAltCell: last.querySelectorAll(".alt-art").length,
            tilesInCardCell: card.querySelectorAll(".alt-art").length,
            altLeft: last.getBoundingClientRect().left,
            cardRight: card.getBoundingClientRect().right,
          };
        }),
      };
    }, [IZO, ...list.others]);
    expect(geometry.fits).toBe(true);
    const izo = geometry.rows.find((r) => r.text.includes(IZO))!;
    expect(izo.lastIsAlt).toBe(true);
    expect(izo.tilesInAltCell).toBeGreaterThan(0);
    expect(izo.tilesInCardCell).toBe(0);
    expect(izo.altLeft).toBeGreaterThanOrEqual(izo.cardRight);
    // A card without alts still gets the cell (a dash), so the column stays aligned down the table.
    const plain = geometry.rows.find((r) => !r.text.includes(IZO))!;
    expect(plain.lastIsAlt).toBe(true);
    expect(plain.tilesInAltCell).toBe(0);
    expect(plain.altLeft).toBe(izo.altLeft);
    const issues = await planner.audit();
    expect(issues, formatIssues(issues)).toEqual([]);
  });
}

for (const list of LISTS) {
  test(`${list.name} grid cards in one row are as tall as the tallest (#877)`, async ({ page, planner }) => {
    planner.manyAlts(IZO, 3);
    await planner.open(list.path);
    await setLayout(page, "Grid");
    const cards = page.locator(".grid-card:visible");
    await expect(cards.first()).toBeVisible();
    const rows = await cards.evaluateAll((els) => {
      const rects = els.map((e) => {
        const r = e.getBoundingClientRect();
        const body = e.querySelector(".grid-card-body")!;
        return { id: e.querySelector(".card-id")?.textContent, top: Math.round(r.top), height: r.height, slack: r.bottom - body.getBoundingClientRect().bottom };
      });
      const byTop = new Map<number, typeof rects>();
      for (const r of rects) byTop.set(r.top, [...(byTop.get(r.top) ?? []), r]);
      return [...byTop.values()];
    });
    const izoRow = rows.find((row) => row.some((c) => c.id === IZO))!;
    expect(izoRow.length).toBeGreaterThan(1);
    const tallest = Math.max(...izoRow.map((c) => c.height));
    for (const c of izoRow) expect(c.height).toBeCloseTo(tallest, 0);
    // Izo's alt tiles make it the tall one; a neighbour without alts really was stretched (empty space under its content).
    expect(izoRow.some((c) => c.slack > 40)).toBe(true);
    const issues = await planner.audit();
    expect(issues, formatIssues(issues)).toEqual([]);
  });
}

/** What the alt box of the first matching card shows: tiles fully in view, whether it scrolls, and whether the last tile is reachable. */
async function altBox(card: Locator) {
  const box = card.locator(".alt-arts").first();
  await expect(box).toBeVisible();
  return box.evaluate((el) => {
    const tiles = [...el.querySelectorAll(".alt-art")] as HTMLElement[];
    const view = () => {
      const b = el.getBoundingClientRect();
      const inView = tiles.filter((t) => {
        const r = t.getBoundingClientRect();
        return r.top >= b.top - 1 && r.bottom <= b.bottom + 1;
      });
      return { count: inView.length, rows: new Set(inView.map((t) => Math.round(t.getBoundingClientRect().top))).size };
    };
    const before = view();
    const style = getComputedStyle(el);
    const result = {
      tiles: tiles.length,
      scrolls: el.scrollHeight > el.clientHeight + 40,
      overflowY: style.overflowY,
      noSideways: el.scrollWidth <= el.clientWidth,
      before,
      lastReachable: false,
    };
    el.scrollTop = el.scrollHeight;
    const last = tiles[tiles.length - 1].getBoundingClientRect();
    const b = el.getBoundingClientRect();
    result.lastReachable = last.top >= b.top - 1 && last.bottom <= b.bottom + 1;
    return result;
  });
}

type Case = { name: string; path: string; card: (page: Page) => Locator; layout: "List" | "Grid" };
const byText = (page: Page, selector: string, text: string) => page.locator(selector).filter({ hasText: text });
const SCROLL_CASES: Case[] = [
  { name: "deck list", path: "/decks/1", card: (p) => p.locator(`[data-card-id="${IZO}"]:visible`), layout: "List" },
  { name: "deck grid", path: "/decks/1", card: (p) => p.locator(`.grid-card[data-card-id="${IZO}"]:visible`), layout: "Grid" },
  { name: "Shopping list", path: "/", card: (p) => byText(p, ".desktop-table tbody tr:visible, .mobile-card:visible", IZO), layout: "List" },
  { name: "Shopping grid", path: "/", card: (p) => byText(p, ".grid-card:visible", IZO), layout: "Grid" },
  { name: "Collection list", path: "/collection", card: (p) => p.locator(`[data-card-id="${IZO}"]:visible`), layout: "List" },
  { name: "Collection grid", path: "/collection", card: (p) => p.locator(`[data-card-id="${IZO}"]:visible`), layout: "Grid" },
];

for (const c of SCROLL_CASES) {
  test(`${c.name}: a card with many alts shows about five tiles, then the alt box scrolls (#877)`, async ({ page, planner }, testInfo) => {
    planner.manyAlts(IZO, 8);
    await planner.open(c.path);
    await setLayout(page, c.layout);
    const phoneList = testInfo.project.name === "phone-375" && c.layout === "List";
    const box = await altBox(c.card(page));
    // Izo's 8 alts + the one in the fixture + the Base tile.
    expect(box.tiles).toBe(10);
    expect(box.scrolls).toBe(true);
    expect(box.overflowY).toBe("auto");
    expect(box.noSideways).toBe(true);
    // Desktop table and grid stack one tile per row: five visible. The phone list fits two per row: three rows.
    if (phoneList) expect(box.before.rows).toBe(3);
    else expect(box.before.count).toBe(5);
    expect(box.lastReachable).toBe(true);
  });
}

test("group buy: a card with many alts shows about five tiles, then the alt box scrolls (#877)", async ({ page, planner }, testInfo) => {
  planner.manyAlts(KID, 8);
  await planner.open(`/group-buys/${GROUP_BUY_ID}`);
  const layouts = ["List", "Grid"] as const;
  for (const layout of layouts) {
    await setLayout(page, layout);
    const card = byText(page, layout === "Grid" ? ".grid-card:visible" : ".desktop-table tbody tr:visible, .mobile-card:visible", KID);
    const box = await altBox(card);
    // Kid's 8 alts + the Base tile.
    expect(box.tiles).toBe(9);
    expect(box.scrolls).toBe(true);
    expect(box.overflowY).toBe("auto");
    expect(box.noSideways).toBe(true);
    if (testInfo.project.name === "phone-375" && layout === "List") expect(box.before.rows).toBe(3);
    else expect(box.before.count).toBe(5);
    expect(box.lastReachable).toBe(true);
  }
});
