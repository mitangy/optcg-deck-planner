/**
 * UI audit of every /demo fixture screen (prompts, full board, statuses,
 * match over, …) at each project's screen size. The fixtures cover prompt
 * states a random playthrough rarely reaches.
 */
import { test, expect, formatIssues, preferFan } from "./fixtures";
import { isKnown } from "./known-issues";

const SCREENS = [
  "",
  "?turn0",
  "?full",
  "?statuses",
  "?over",
  "?undo=ask",
  "?faceup=2",
  "?counter=block",
  ...["don", "don2", "look", "satori", "rest", "select", "restgrid", "selectgrid", "confirm", "hand", "order", "effects", "mode"].map((p) => `?prompt=${p}`),
  // Searches and effect ordering float by default; `?box` keeps the old pop-up.
  ...["look", "satori", "effects"].map((p) => `?box&prompt=${p}`),
];

for (const screen of SCREENS) {
  test(`/demo${screen} passes the UI audit`, async ({ page, duel }, info) => {
    await page.goto(`/demo${screen}`);
    await page.locator(".board-root").waitFor();
    const issues = (await duel.audit()).filter((i) => !isKnown(i));
    if (issues.length) await page.screenshot({ path: info.outputPath("audit.png") });
    expect(issues, formatIssues(issues)).toEqual([]);
    expect(duel.errors).toEqual([]);
  });
}

// The "Tilted board" setting leans both mats back in perspective (desktop only).
for (const screen of ["?full", "?statuses", "?attack"]) {
  test(`/demo${screen} with the tilted board passes the UI audit`, async ({ page, duel }, info) => {
    await page.addInitScript(() =>
      localStorage.setItem("optcg-duel:settings", JSON.stringify({ tiltedBoard: true })),
    );
    await preferFan(page);
    await page.goto(`/demo${screen}`);
    await page.locator(".board-root").waitFor();
    const issues = (await duel.audit()).filter((i) => !isKnown(i));
    if (issues.length) await page.screenshot({ path: info.outputPath("audit.png") });
    expect(issues, formatIssues(issues)).toEqual([]);
    expect(duel.errors).toEqual([]);
  });
}

// Searchers always float their cards; an old saved "Floating cards" off no longer brings the pop-up back.
test("a searcher floats its cards even with Floating cards saved off (#288)", async ({ page }) => {
  await page.addInitScript(() =>
    localStorage.setItem("optcg-duel:settings", JSON.stringify({ floatingCards: false })),
  );
  await page.goto("/demo?prompt=look");
  await page.locator(".board-root").waitFor();
  await expect(page.locator(".float-layer .float-card").first()).toBeVisible();
  await expect(page.locator(".choice-prompt")).toHaveCount(0);
});

// A clicked hand card, Sort or Hand button keeps focus; the fan must still tuck
// once the pointer leaves it, or it sits on your DON!! row (flat board).
test("the centre hand fan tucks away after a click once the pointer leaves", async ({ page }) => {
  test.skip(test.info().project.name !== "desktop-1280", "the fan is desktop only");
  await preferFan(page);
  await page.goto("/demo?full");
  await page.locator(".board-root").waitFor();
  const donCovered = () =>
    page.evaluate(() => {
      const r = document.querySelector(".side-you .don-strip")!.getBoundingClientRect();
      return !!document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2)?.closest(".hand-fan");
    });
  expect(await donCovered()).toBe(false);

  const card = page.locator(".hand-fan-cards > .card-tile").nth(2);
  await card.click({ position: { x: 20, y: 15 } }); // select
  await card.click({ position: { x: 20, y: 30 } }); // deselect; the card keeps focus
  await page.locator(".hand-fan-head .hand-rail-btn").click(); // Sort keeps focus too
  await page.mouse.move(640, 120);
  await expect.poll(donCovered, { timeout: 3000 }).toBe(false);
});

// A clicked Hand button keeps focus, and the next key press (S here) makes it
// :focus-visible, which held the fan up after "Let the hand tuck away".
test("the hand fan tucks away after Let the hand tuck away and a key press (#291)", async ({ page }) => {
  test.skip(test.info().project.name !== "desktop-1280", "the fan is desktop only");
  await page.addInitScript(() =>
    localStorage.setItem("optcg-duel:settings", JSON.stringify({ keepHandOpen: true, handLayout: "fan" })),
  );
  await preferFan(page);
  await page.goto("/demo?full");
  await page.locator(".board-root").waitFor();
  const toggle = page.locator(".hand-fan-toggle");
  await expect(toggle).toHaveAttribute("title", "Let the hand tuck away");
  await toggle.click();
  await page.mouse.move(640, 120);
  await page.keyboard.press("s");
  const fanUp = () =>
    page.evaluate(() => {
      const r = document.querySelector(".side-you .don-strip")!.getBoundingClientRect();
      return !!document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2)?.closest(".hand-fan");
    });
  await expect.poll(fanUp, { timeout: 3000 }).toBe(false);
});

// The pointer is still on the Hand button after the click, so hover held the
// fan up and "Let the hand tuck away" looked like it did nothing (#307).
test("Let the hand tuck away lowers the fan at once, under the pointer (#307)", async ({ page }) => {
  test.skip(test.info().project.name !== "desktop-1280", "the fan is desktop only");
  await page.addInitScript(() =>
    localStorage.setItem("optcg-duel:settings", JSON.stringify({ keepHandOpen: true })),
  );
  await preferFan(page);
  await page.goto("/demo?full");
  await page.locator(".board-root").waitFor();
  const fan = page.locator(".hand-fan");
  const lift = () => fan.evaluate((el) => new DOMMatrix(getComputedStyle(el).transform).m42);
  await expect.poll(lift, { timeout: 3000 }).toBeLessThan(0); // raised
  await page.locator(".hand-fan-toggle").click();
  // The pointer has not moved off the button.
  await expect.poll(lift, { timeout: 3000 }).toBeGreaterThan(20);
  await expect(page.locator(".hand-fan-toggle")).toHaveAttribute("title", "Keep the hand up (H)");
});

// A floating fan was always fully shown, so its tuck button did nothing (#307).
test("a floating hand fan tucks to its handle and shows its cards on hover (#307)", async ({ page }) => {
  test.skip(test.info().project.name !== "desktop-1280", "the fan is desktop only");
  await page.addInitScript(() =>
    localStorage.setItem(
      "optcg-duel:settings",
      JSON.stringify({ keepHandOpen: true, handLayout: "fan", handFanPos: "0.5,0.6" }),
    ),
  );
  await page.goto("/demo?full");
  await page.locator(".board-root").waitFor();
  await expect(page.locator(".hand-fan")).toHaveClass(/hand-fan-float/);
  const cards = page.locator(".hand-fan-cards");
  const cardsShown = () => cards.evaluate((el) => getComputedStyle(el).visibility !== "hidden");
  await expect.poll(cardsShown).toBe(true);

  const toggle = page.locator(".hand-fan-toggle");
  await expect(toggle).toHaveAttribute("title", "Let the hand tuck away");
  await toggle.click();
  await expect.poll(cardsShown, { timeout: 3000 }).toBe(false);
  await page.mouse.move(640, 120);
  await toggle.hover();
  await expect.poll(cardsShown, { timeout: 3000 }).toBe(true);
  await page.mouse.move(640, 120);
  await expect.poll(cardsShown, { timeout: 3000 }).toBe(false);

  await toggle.click(); // Keep the hand up
  await page.mouse.move(640, 120);
  await expect.poll(cardsShown, { timeout: 3000 }).toBe(true);
});

// H with the pointer away from the hand: the next hover raises it again. H
// used to mark the hand as tucked under the pointer, so it stayed down (a
// floating fan's cards hidden) until the pointer had left it once (#312).
test("after H tucks a floating hand fan, hovering it raises it again (#312)", async ({ page }) => {
  test.skip(test.info().project.name !== "desktop-1280", "the fan is desktop only");
  await page.addInitScript(() =>
    localStorage.setItem(
      "optcg-duel:settings",
      JSON.stringify({ keepHandOpen: false, handLayout: "fan", handFanPos: "0.5,0.6" }),
    ),
  );
  await page.goto("/demo?full");
  await page.locator(".board-root").waitFor();
  await expect(page.locator(".hand-fan")).toHaveClass(/hand-fan-float/);
  const cards = page.locator(".hand-fan-cards");
  const cardsShown = () => cards.evaluate((el) => getComputedStyle(el).visibility !== "hidden");
  await expect.poll(cardsShown).toBe(true);

  await page.mouse.move(640, 60);
  await page.keyboard.press("h");
  await expect(page.locator(".hand-fan-toggle")).toHaveAttribute("title", "Keep the hand up (H)");
  await expect.poll(cardsShown, { timeout: 3000 }).toBe(false);
  await page.locator(".hand-fan-toggle").hover();
  await expect.poll(cardsShown, { timeout: 3000 }).toBe(true);
});

// Clicking an empty card slot or a pile must not drop a blinking text caret on the mat.
test("clicking board slots leaves no text caret on the mat (#246)", async ({ page }) => {
  await page.goto("/demo");
  await page.locator(".board-root").waitFor();
  for (const target of [".side-field .zone-slot", ".side-field .zone-pile-deck", ".side-field .zone-pile-don"]) {
    await page.locator(target).first().click({ force: true });
    const selection = await page.evaluate(() => {
      const s = getSelection();
      return { type: s?.type, inField: !!s?.anchorNode?.parentElement?.closest(".side-field") };
    });
    expect({ target, ...selection }).not.toMatchObject({ type: "Caret", inField: true });
  }
});

// The strip between the mats draws no divider line or diamond, but keeps its height for the prompt text (#449).
test("an idle midline strip has no divider line and keeps the height of one with a prompt (#449)", async ({ page }) => {
  await page.goto("/demo?cantattack");
  await page.locator(".board-root").waitFor();
  await expect(page.locator(".midline")).toHaveCount(1);
  // The phone Rotate hint is the only thing an idle strip may hold.
  await expect(page.locator(".midline > :not(.rotate-hint)")).toHaveCount(0);
  await expect(page.locator(".midline-ornament")).toHaveCount(0);
  const idle = (await page.locator(".midline").boundingBox())!.height;
  await page.goto("/demo?attacked");
  await expect(page.locator(".midline .prompt-text")).toBeVisible();
  expect((await page.locator(".midline").boundingBox())!.height).toBeCloseTo(idle, 0);
});

// The prompt text in the strip between the mats is chrome: double-clicking it must not select a word (#314).
test("double-clicking the midline prompt text selects nothing (#314)", async ({ page }) => {
  await page.goto("/demo?attacked");
  const text = page.locator(".midline .prompt-text");
  await expect(text).toBeVisible();
  await text.dblclick();
  const selected = await page.evaluate(() => getSelection()?.toString() ?? "");
  expect(selected).toBe("");
});

// DON!! −N used to open a grid of DON!! cards: pick them off the board instead.
test("DON!! −2 is paid by tapping a cost-area DON!! and the Leader it sits under, no pop-up (#258)", async ({ page }) => {
  await page.goto("/demo?prompt=don2");
  await page.locator(".board-root").waitFor();
  await expect(page.locator(".field-bar")).toBeVisible();
  await expect(page.locator(".choice-prompt")).toHaveCount(0);
  // force: skip Playwright's enabled check, so a disabled chip fails on the count below instead of timing out.
  await page.locator('.don-strip-you .don-chip-btn[data-don-id="d4"]').click({ force: true });
  await page.locator('.side-you .card-tile[data-instance-id="y-leader"]').first().click();
  await expect(page.locator(".field-bar-count")).toHaveText("Choose 2 · selected 2");
  await page.locator(".field-bar .btn-primary").click();
  const sent = await page.evaluate(() => (window as { __demoIntents?: unknown[] }).__demoIntents);
  // o3 is the first rested DON!!, o6 the first DON!! on the Leader.
  expect(sent).toEqual([{ type: "resolve_pending_choice", accept: true, selectedOptionIds: ["o3", "o6"] }]);
});

// Keep hand open: H (or the Hide button) tucks the whole hand away and brings it back.
test("H hides and shows the hand with Keep hand open (#259)", async ({ page }) => {
  test.skip(test.info().project.name !== "desktop-1280", "the fan is desktop only");
  await page.addInitScript(() =>
    localStorage.setItem("optcg-duel:settings", JSON.stringify({ keepHandOpen: true })),
  );
  await preferFan(page);
  await page.goto("/demo?full");
  await page.locator(".board-root").waitFor();
  await page.mouse.move(640, 120);
  const card = page.locator(".hand-fan-cards > .card-tile").nth(2);
  // Any part of the card on screen and drawn (a tucked hand still shows its top edge).
  const cardShown = () =>
    card.evaluate((el) => {
      const r = el.getBoundingClientRect();
      return getComputedStyle(el).visibility !== "hidden" && r.top < innerHeight - 1 && r.bottom > 0;
    });
  await expect.poll(cardShown, { timeout: 3000 }).toBe(true);

  await page.keyboard.press("h");
  await expect.poll(cardShown, { timeout: 3000 }).toBe(false);
  await expect(page.locator(".hand-fan .hand-hide-btn")).toHaveText("Show");

  await page.mouse.move(640, 120);
  await page.keyboard.press("h");
  await expect.poll(cardShown, { timeout: 3000 }).toBe(true);
});

// Status icons follow the card size (so the window) and the Text size setting.
test("status icons scale with the card and the Text size setting (#259)", async ({ page }) => {
  test.skip(test.info().project.name !== "desktop-1280", "one desktop size is enough");
  const iconRatio = async (textSize: string, w: number, h: number) => {
    await page.setViewportSize({ width: w, height: h });
    await page.evaluate((t) => localStorage.setItem("optcg-duel:settings", JSON.stringify({ textSize: t })), textSize);
    await page.goto("/demo?statuses");
    await page.locator(".board-root").waitFor();
    return page.locator(".side-you .status-icon").first().evaluate((el) => ({
      icon: (el as HTMLElement).offsetWidth,
      tile: (el.closest(".card-tile") as HTMLElement).offsetWidth,
    }));
  };
  await page.goto("/demo");
  const big = await iconRatio("medium", 2560, 1440);
  // A big window's cards get proportionally big icons, not a fixed small cap.
  expect(big.icon / big.tile).toBeGreaterThan(0.15);
  const medium = await iconRatio("medium", 1440, 900);
  const xlarge = await iconRatio("xlarge", 1440, 900);
  expect(xlarge.icon).toBeGreaterThan(medium.icon);
  // Never wider than a third of the card.
  expect(xlarge.icon).toBeLessThanOrEqual(xlarge.tile / 3);
});

// Side panels: drag a panel's grip into the other column; the layout is saved
// with the settings and Reset layout puts every panel back.
test("the Grid hand drags into the left column, stays after a reload, and Reset layout puts it back (#261)", async ({ page, duel }, info) => {
  test.skip(info.project.name !== "desktop-1280", "side panels move on desktop only");
  await page.addInitScript(() => {
    if (!localStorage.getItem("optcg-duel:settings")) {
      localStorage.setItem("optcg-duel:settings", JSON.stringify({ handLayout: "grid" }));
    }
  });
  await page.goto("/demo?full");
  await page.locator(".board-root").waitFor();
  const column = (col: "left" | "right") =>
    page.$$eval(`[data-panel-col="${col}"] > [data-panel]`, (els) => els.map((e) => (e as HTMLElement).dataset.panel));
  expect(await column("left")).toEqual(["preview", "recent", "log"]);

  await page.locator('[data-panel="hand"]').hover();
  const grip = (await page.locator('[data-panel="hand"] > .panel-grip').boundingBox())!;
  const log = (await page.locator('[data-panel="log"]').boundingBox())!;
  await page.mouse.move(grip.x + grip.width / 2, grip.y + grip.height / 2);
  await page.mouse.down();
  await page.mouse.move(log.x + log.width / 2, log.y + 8, { steps: 6 });
  await expect(page.locator(".panel-drop-line")).toBeVisible();
  await page.mouse.up();
  await expect.poll(() => column("left")).toEqual(["preview", "recent", "hand", "log"]);
  expect(await column("right")).not.toContain("hand");

  // The hand still works from its new column and nothing overlaps.
  const issues = (await duel.audit()).filter((i) => !isKnown(i));
  if (issues.length) await page.screenshot({ path: info.outputPath("audit.png") });
  expect(issues, formatIssues(issues)).toEqual([]);

  await page.reload();
  await page.locator(".board-root").waitFor();
  await expect.poll(() => column("left")).toEqual(["preview", "recent", "hand", "log"]);

  await page.getByRole("button", { name: "Gameplay settings" }).click();
  await page.getByRole("button", { name: "Reset layout" }).click();
  await page.keyboard.press("Escape");
  await expect.poll(() => column("left")).toEqual(["preview", "recent", "log"]);
  expect(await column("right")).toContain("hand");
  expect(duel.errors).toEqual([]);
});

// Side panels resize: the rail's inner edge sets its width, the divider between two
// panels moves height from one to the other; both are saved and Reset layout clears them.
test("the right rail and the preview divider drag to resize, stay after a reload, and Reset layout restores them (#347)", async ({ page, duel }, info) => {
  test.skip(info.project.name !== "desktop-1280", "side panels resize on desktop only");
  await page.goto("/demo?full");
  await page.locator(".board-root").waitFor();
  const width = async () => (await page.locator('[data-panel-col="right"]').boundingBox())!.width;
  const height = async (id: string) => (await page.locator(`[data-panel="${id}"]`).boundingBox())!.height;
  const drag = async (selector: string, dx: number, dy: number, offsetX = 0) => {
    const box = (await page.locator(selector).boundingBox())!;
    const x = box.x + (offsetX || box.width / 2);
    const y = box.y + box.height / 2;
    await page.mouse.move(x, y);
    await page.mouse.down();
    await page.mouse.move(x + dx, y + dy, { steps: 8 });
    await page.mouse.up();
  };
  const divider = '[role="separator"][aria-label="Resize Card preview and Recent plays"]';

  const w0 = await width();
  const preview0 = await height("preview");
  const recent0 = await height("recent");
  await drag(".col-resize-right", -80, 0);
  await expect.poll(width).toBeGreaterThan(w0 + 70);
  // The left column keeps its width; the board gave the room.
  await drag(divider, 0, -40, 12);
  await expect.poll(() => height("preview")).toBeLessThan(preview0 - 30);
  // Height moved to the panel below; the pair's total did not change.
  expect((await height("preview")) + (await height("recent"))).toBeCloseTo(preview0 + recent0, 0);
  const w1 = await width();
  const preview1 = await height("preview");

  // A hovered handle shows its line; the audit checks the board at rest.
  await page.mouse.move(640, 20);
  const issues = (await duel.audit()).filter((i) => !isKnown(i));
  if (issues.length) await page.screenshot({ path: info.outputPath("audit.png") });
  expect(issues, formatIssues(issues)).toEqual([]);

  await page.reload();
  await page.locator(".board-root").waitFor();
  expect(Math.abs((await width()) - w1)).toBeLessThan(2);
  expect(Math.abs((await height("preview")) - preview1)).toBeLessThan(2);

  await page.getByRole("button", { name: "Gameplay settings" }).click();
  await page.getByRole("button", { name: "Reset layout" }).click();
  await page.keyboard.press("Escape");
  await expect.poll(width).toBeCloseTo(w0, 0);
  await expect.poll(() => height("preview")).toBeCloseTo(preview0, 0);
  expect(duel.errors).toEqual([]);
});

// Dragging a divider or a column edge to its end must not squash a panel under its content:
// Turn and clocks painted its Life / Hand / Deck / DON!! rows over the panel below it (#370).
test("Turn and clocks keeps its content height and its column its width when dragged to the end (#370)", async ({ page }, info) => {
  test.skip(info.project.name !== "desktop-1280", "side panels resize on desktop only");
  await page.goto("/demo?full");
  await page.locator(".board-root").waitFor();
  const drag = async (selector: string, dx: number, dy: number, offsetX = 0) => {
    const box = (await page.locator(selector).boundingBox())!;
    const x = box.x + (offsetX || box.width / 2);
    const y = box.y + box.height / 2;
    await page.mouse.move(x, y);
    await page.mouse.down();
    await page.mouse.move(x + dx, y + dy, { steps: 8 });
    await page.mouse.up();
  };
  const turn = () =>
    page.$eval('[data-panel="turn"]', (el) => ({
      h: el.getBoundingClientRect().height,
      content: el.scrollHeight,
      w: el.getBoundingClientRect().width,
      contentW: el.scrollWidth,
    }));
  const natural = (await turn()).content;

  await drag('[role="separator"][aria-label^="Resize Turn and clocks and "]', 0, -900, 12);
  await page.waitForTimeout(300);
  const squeezed = await turn();
  expect(squeezed.h).toBeGreaterThanOrEqual(natural - 1);
  expect(squeezed.content).toBeLessThanOrEqual(Math.ceil(squeezed.h));

  // The column edge dragged as far as it goes keeps the Turn panel's stats readable.
  await drag(".col-resize-right", 900, 0);
  const w = (await page.locator('[data-panel-col="right"]').boundingBox())!.width;
  expect(w).toBeGreaterThanOrEqual(250);
  const narrow = await turn();
  expect(narrow.contentW).toBeLessThanOrEqual(Math.ceil(narrow.w));
});

// A fanned hand parked against a screen edge reaches over the side column; where a card and the
// column's resize handle overlap, the card wins: the handle neither lights up nor grabs the drag (#449).
for (const side of ["left", "right"] as const) {
  test(`a hand card over the ${side} column edge gets the pointer, not the resize handle (#449)`, async ({ page }, info) => {
    test.skip(info.project.name !== "desktop-1280", "side panels resize on desktop only");
    await page.addInitScript(
      (pos) => localStorage.setItem("optcg-duel:settings", JSON.stringify({ handLayout: "fan", handFanPos: pos })),
      side === "right" ? "0.97,1" : "0.03,1",
    );
    await page.goto("/demo?full&hand=8");
    await page.locator(".board-root").waitFor();
    const handle = page.locator(`.col-resize-${side}`);
    const col = page.locator(`[data-panel-col="${side}"]`);
    await page.locator(".hand-fan").hover({ position: { x: 30, y: 8 }, force: true });
    await page.waitForTimeout(700);
    // The middle of the patch where a fanned card and the handle overlap.
    const spot = await page.evaluate((cls) => {
      const h = document.querySelector(cls)!.getBoundingClientRect();
      for (const c of document.querySelectorAll(".hand-fan .card-tile")) {
        const r = c.getBoundingClientRect();
        const x0 = Math.max(r.left, h.left);
        const x1 = Math.min(r.right, h.right);
        const y0 = Math.max(r.top, h.top);
        const y1 = Math.min(r.bottom, h.bottom);
        if (x1 - x0 > 4 && y1 - y0 > 4) return { x: (x0 + x1) / 2, y: (y0 + y1) / 2 };
      }
      return null;
    }, `.col-resize-${side}`);
    expect(spot, "a fanned card should reach over the column edge").not.toBeNull();
    const { x, y } = spot!;
    await page.mouse.move(x, y);
    expect(await page.evaluate(([px, py]) => !!document.elementFromPoint(px!, py!)?.closest(".hand-fan .card-tile"), [x, y])).toBe(true);
    await page.waitForTimeout(250);
    expect(await handle.evaluate((el) => getComputedStyle(el).opacity)).toBe("0");
    const w0 = (await col.boundingBox())!.width;
    await page.mouse.down();
    await page.mouse.move(x + (side === "right" ? -80 : 80), y, { steps: 6 });
    await page.mouse.up();
    expect(Math.abs((await col.boundingBox())!.width - w0)).toBeLessThan(2);
    // Off the card the handle still grabs.
    const box = (await handle.boundingBox())!;
    await page.mouse.move(box.x + box.width / 2, box.y + 120);
    await page.mouse.down();
    await page.mouse.move(box.x + box.width / 2 + (side === "right" ? -60 : 60), box.y + 120, { steps: 6 });
    await page.mouse.up();
    expect((await col.boundingBox())!.width).toBeGreaterThan(w0 + 40);
  });
}

// Phones and landscape phones have no side columns to resize.
test("phones show no panel resize handles (#347)", async ({ page }, info) => {
  test.skip(info.project.name !== "phone-375", "the phone project only");
  for (const size of [{ width: 375, height: 812 }, { width: 812, height: 375 }]) {
    await page.setViewportSize(size);
    await page.goto("/demo?full");
    await page.locator(".board-root").waitFor();
    await expect(page.locator('[role="separator"]')).toHaveCount(0);
  }
});

// One fan, moved by its grip anywhere on the screen; Drag handles off hides
// every grip but keeps the layout.
test("the fanned hand drags to the middle of the screen and floats there after a reload, and Drag handles off hides the grips (#261)", async ({ page, duel }, info) => {
  test.skip(info.project.name !== "desktop-1280", "the fan moves on desktop only");
  await preferFan(page);
  await page.goto("/demo?full");
  await page.locator(".board-root").waitFor();
  const fan = page.locator(".hand-fan");
  await expect(fan).toHaveClass(/hand-fan-center/);

  const grip = (await page.locator(".hand-fan-grip").boundingBox())!;
  await page.mouse.move(grip.x + grip.width / 2, grip.y + grip.height / 2);
  await page.mouse.down();
  // The docked fan's grip sits above its cards (the handle is stacked, #449), so aim higher to land clear of the End turn dock.
  await page.mouse.move(grip.x + 200, 230, { steps: 8 });
  await page.mouse.up();
  await expect(fan).toHaveClass(/hand-fan-float/);
  const box = (await fan.boundingBox())!;
  // Fully shown above the bottom edge, not tucked off it.
  expect(box.y + box.height).toBeLessThan(720 - 100);

  const issues = (await duel.audit()).filter((i) => !isKnown(i));
  if (issues.length) await page.screenshot({ path: info.outputPath("audit.png") });
  expect(issues, formatIssues(issues)).toEqual([]);

  await page.reload();
  await page.locator(".board-root").waitFor();
  await expect(fan).toHaveClass(/hand-fan-float/);
  await expect(page.locator(".hand-fan-grip")).toHaveCount(1);
  await expect(page.locator(".panel-grip").first()).toBeAttached();

  await page.getByRole("button", { name: "Gameplay settings" }).click();
  await page.getByLabel("Drag handles").uncheck();
  await page.keyboard.press("Escape");
  await expect(page.locator(".hand-fan-grip")).toHaveCount(0);
  await expect(page.locator(".panel-grip")).toHaveCount(0);
  await expect(fan).toHaveClass(/hand-fan-float/);
  expect(duel.errors).toEqual([]);
});

// The Battle log's own heading sat above the grip, so its drag selected text instead.
test("the Battle log drags by its grip into the right column (#261)", async ({ page }, info) => {
  test.skip(info.project.name !== "desktop-1280", "side panels move on desktop only");
  await page.goto("/demo?full");
  await page.locator(".board-root").waitFor();
  await page.locator('[data-panel="log"]').hover();
  const grip = (await page.locator('[data-panel="log"] > .panel-grip').boundingBox())!;
  const rail = (await page.locator('[data-panel-col="right"]').boundingBox())!;
  await page.mouse.move(grip.x + grip.width / 2, grip.y + grip.height / 2);
  await page.mouse.down();
  await page.mouse.move(rail.x + rail.width / 2, rail.y + rail.height - 20, { steps: 6 });
  await page.mouse.up();
  await expect
    .poll(() => page.$$eval('[data-panel-col="right"] > [data-panel]', (els) => els.map((e) => (e as HTMLElement).dataset.panel)))
    .toContain("log");
  expect(await page.evaluate(() => getSelection()?.toString() ?? "")).toBe("");
});

// Tab goes through the field cards, then the hand, then out to the other
// controls and back, instead of looping over the field cards (#262).
test("Tab visits the field cards, the hand, then the other controls and comes back (#262)", async ({ page }, info) => {
  test.skip(info.project.name !== "desktop-1280", "keyboard play is desktop");
  await page.goto("/demo?full");
  await page.locator(".board-root").waitFor();
  const seen: string[] = [];
  for (let i = 0; i < 80; i++) {
    await page.keyboard.press("Tab");
    seen.push(
      await page.evaluate(() => {
        const el = document.activeElement as HTMLElement | null;
        if (!el) return "none";
        if (el.closest(".side-field")) return "field";
        if (el.closest(".hand-fan-cards, .hand-row-inner, .rail-hand-cards")) return "hand";
        return `other:${el.getAttribute("aria-label") ?? el.textContent?.trim().slice(0, 20)}`;
      }),
    );
  }
  const firstHand = seen.indexOf("hand");
  expect(seen[0]).toBe("field");
  expect(firstHand).toBeGreaterThan(0);
  expect(seen.slice(0, firstHand).every((s) => s === "field"), seen.join(", ")).toBe(true);
  const others = seen.filter((s) => s.startsWith("other:"));
  expect(others.some((s) => /concede/i.test(s)), seen.join(", ")).toBe(true);
  // After the other controls, Tab comes back round to the cards.
  expect(seen.lastIndexOf("field")).toBeGreaterThan(seen.indexOf(others[0]!));
});

// Landscape phone: the "Waiting for opponent" pill fits in the right rail
// instead of running off the screen (#262).
test("the waiting pill stays on screen on a landscape phone (#262)", async ({ page }, info) => {
  test.skip(info.project.name !== "phone-375", "landscape phone layout");
  await page.setViewportSize({ width: 812, height: 375 });
  await page.goto("/demo?wait=opponent");
  const pill = page.locator(".waiting-opp").first();
  await pill.waitFor();
  const box = (await pill.boundingBox())!;
  expect(box.x + box.width).toBeLessThanOrEqual(812);
  const text = await pill.locator(".waiting-opp-text strong").evaluate((el) => el.scrollWidth - el.clientWidth);
  expect(text).toBeLessThanOrEqual(1);
});

// A landscape phone narrower than 600px (iPhone SE, 568x320) gets the landscape layout, not the portrait one whose
// hand panel fills the screen and squeezes the mats to nothing (#469).
test("a small landscape phone gets the landscape board with readable cards (#469)", async ({ page }, info) => {
  test.skip(info.project.name !== "phone-375", "landscape phone layout");
  for (const size of [{ width: 568, height: 320 }, { width: 640, height: 360 }]) {
    await page.setViewportSize(size);
    await page.goto("/demo");
    await page.locator(".board-root").waitFor();
    await expect(page.locator(".arena")).toHaveClass(/arena-lp/);
    const card = (await page.locator(".side-grid .card-tile").first().boundingBox())!;
    expect(card.width, `card width at ${size.width}x${size.height}`).toBeGreaterThanOrEqual(24);
    expect(card.y + card.height).toBeLessThanOrEqual(size.height);
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(size.width);
  }
});

// Deck editor (#262): art that fails to load falls back to the card id
// instead of a broken image, and − count + stay on one row.
async function openSeededDeck(page: import("@playwright/test").Page, failArt: boolean) {
  await page.addInitScript(() => {
    const cards = [...Array(4).fill("ST01-004"), ...Array(4).fill("ST01-005"), ...Array(2).fill("ST01-006")];
    localStorage.setItem(
      "optcg.duel.savedDecks.v1",
      JSON.stringify([{ id: "review-deck", name: "Review deck", leaderId: "ST01-001", cards, updatedAt: 1 }]),
    );
  });
  if (failArt) await page.route(/\.(png|jpe?g|webp)(\?.*)?$/, (r) => r.fulfill({ status: 404, body: "" }));
  await page.goto("/decks/review-deck/configure");
  await page.locator(".deck-stack").first().waitFor();
}

test("deck editor shows the card id when art fails to load (#262)", async ({ page }, info) => {
  test.skip(info.project.name !== "desktop-1280", "one size is enough");
  await openSeededDeck(page, true);
  await expect(page.locator(".deck-stack-fallback").first()).toBeVisible();
  await expect.poll(() => page.locator(".deck-stack-art img").count()).toBe(0);
});

test("deck editor keeps − count + on one row (#262)", async ({ page }, info) => {
  test.skip(info.project.name !== "desktop-1280", "the stepper wrapped on desktop widths");
  for (const width of [1280, 960]) {
    await page.setViewportSize({ width, height: 800 });
    await openSeededDeck(page, false);
    const row = page.locator(".deck-stack-edit").first();
    const minus = (await row.getByRole("button", { name: /Remove one/ }).boundingBox())!;
    const plus = (await row.getByRole("button", { name: /Add one/ }).boundingBox())!;
    expect(Math.abs(minus.y - plus.y), `at ${width}px`).toBeLessThan(2);
  }
});

// 150 % zoom on a laptop (960x600): the centre fan's handle stays inside the
// board column instead of covering the Battle log (#262).
test("the centre fan handle stays off the Battle log at 960x600 (#262)", async ({ page }, info) => {
  test.skip(info.project.name !== "desktop-1280", "the fan is desktop only");
  await page.setViewportSize({ width: 960, height: 600 });
  await page.goto("/demo?full");
  const fan = page.locator(".hand-fan-center");
  await fan.waitFor();
  const col = (await fan.boundingBox())!;
  const head = (await fan.locator(".hand-fan-head").boundingBox())!;
  expect(head.x).toBeGreaterThanOrEqual(col.x);
});

// 320px phone: the mulligan explainer stays short, so the board keeps
// nearly the size it has once play starts instead of shrinking to a thumbnail (#262).
test("the mulligan explainer leaves the board its size on a 320px phone (#262)", async ({ page }, info) => {
  test.skip(info.project.name !== "phone-375", "small phone");
  await page.setViewportSize({ width: 320, height: 640 });
  const matHeight = async (url: string) => {
    await page.goto(url);
    const mat = page.locator(".side-field.side-you").first();
    await mat.waitFor();
    return (await mat.boundingBox())!.height;
  };
  const playing = await matHeight("/demo");
  const mulligan = await matHeight("/demo?turn0");
  expect(mulligan).toBeGreaterThanOrEqual(playing * 0.85);
});

// Light mode: secondary text on light panels meets WCAG AA (4.5:1) in every
// crew theme (#262).
const LIGHT_THEMES = ["nightSea", "strawHat", "donquixote", "marines", "wano", "heart", "fishMan", "thrillerBark", "disco"];
const LIGHT_TEXT: Record<string, string[]> = {
  "/demo?full": [
    ".recent-play-meta",
    ".card-preview-caption",
    ".card-preview-traits",
    ".battle-log-turn-title",
    ".turn-order-badge:not(.first)",
    ".recent-play-you .recent-play-who",
    ".recent-play-opp .recent-play-who",
    ".log-phase .log-text",
  ],
  // The wordmark kicker is hidden on a wide window; the deck hero and the side column are what shows.
  "/": [".home-deck-label", ".friends-title"],
  "/settings": [".panel-title"],
};

test("light mode secondary text meets 4.5:1 contrast in every theme (#262)", async ({ page }, info) => {
  test.skip(info.project.name !== "desktop-1280", "colours do not depend on size");
  test.setTimeout(120_000);
  const low: string[] = [];
  for (const theme of LIGHT_THEMES) {
    await page.addInitScript(
      (t) => localStorage.setItem("optcg-duel:settings", JSON.stringify({ theme: t, colorMode: "light" })),
      theme,
    );
    for (const [url, selectors] of Object.entries(LIGHT_TEXT)) {
      await page.goto(url);
      await page.locator(selectors[0]!).first().waitFor();
      const ratios = await page.evaluate((sels) => {
        const parse = (c: string) => {
          const m = c.match(/[\d.]+/g)!.map(Number);
          return { r: m[0]!, g: m[1]!, b: m[2]!, a: m[3] ?? 1 };
        };
        const over = (top: { r: number; g: number; b: number; a: number }, under: { r: number; g: number; b: number }) => ({
          r: top.r * top.a + under.r * (1 - top.a),
          g: top.g * top.a + under.g * (1 - top.a),
          b: top.b * top.a + under.b * (1 - top.a),
          a: 1,
        });
        const lum = (c: { r: number; g: number; b: number }) => {
          const f = (v: number) => ((v /= 255) <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4);
          return 0.2126 * f(c.r) + 0.7152 * f(c.g) + 0.0722 * f(c.b);
        };
        const background = (el: Element) => {
          const layers: ReturnType<typeof parse>[] = [];
          for (let n: Element | null = el; n; n = n.parentElement) {
            const bg = parse(getComputedStyle(n).backgroundColor);
            if (bg.a > 0) layers.push(bg);
            if (bg.a >= 1) break;
          }
          let c = { r: 255, g: 255, b: 255 };
          for (const l of layers.reverse()) c = over(l, c);
          return c;
        };
        return sels.map((sel) => {
          const el = document.querySelector(sel);
          if (!el) return { sel, ratio: -1 };
          const bg = background(el);
          const fg = over(parse(getComputedStyle(el).color), bg);
          const [hi, lo] = [lum(fg), lum(bg)].sort((a, b) => b - a);
          return { sel, ratio: (hi! + 0.05) / (lo! + 0.05) };
        });
      }, selectors);
      for (const { sel, ratio } of ratios) {
        if (ratio < 4.5) low.push(`${theme} ${sel} ${ratio < 0 ? "missing" : ratio.toFixed(2)}`);
      }
    }
  }
  expect(low).toEqual([]);
});

// The phone's bottom bar says why it is empty instead of "No legal actions"
// while you answer a prompt, and shows the wait on the opponent (#262). Desktop has no such
// bar: the board dock shows the wait (#368).
test("the action bar says to answer the prompt or shows the wait (#262)", async ({ page }, info) => {
  test.skip(info.project.name !== "phone-375", "the phone's bottom bar");
  await page.goto("/demo?prompt=select");
  await expect(page.locator(".intent-empty")).toHaveText("Answer the prompt to continue");
  await page.goto("/demo?wait=opponent");
  await expect(page.locator(".intent-bar .waiting-opp")).toBeVisible();
});

// Desktop has no Actions panel: Keep opening hand and Mulligan sit side by side
// in the board dock at the midline, and the wait for the opponent shows there too (#368).
test("desktop mulligan puts Keep and Mulligan side by side in the board dock, with no Actions panel (#368)", async ({ page }, info) => {
  test.skip(info.project.name !== "desktop-1280", "desktop board dock");
  await page.goto("/demo?turn0");
  await page.locator(".board-root").waitFor();
  const dock = page.locator(".primary-dock");
  const keep = dock.getByRole("button", { name: "Keep opening hand" });
  const redo = dock.getByRole("button", { name: /^Mulligan/ });
  await expect(keep).toBeVisible();
  await expect(redo).toBeVisible();
  const [k, r] = [(await keep.boundingBox())!, (await redo.boundingBox())!];
  expect(Math.abs(k.y + k.height / 2 - (r.y + r.height / 2))).toBeLessThan(2);
  expect(r.x + r.width).toBeLessThanOrEqual(k.x + 1);
  await expect(redo).toHaveAttribute("data-key-num", "1");
  await expect(page.locator('[data-panel="actions"], .arena-rail .intent-bar')).toHaveCount(0);
  const board = (await page.locator(".board-root").boundingBox())!;
  expect(r.x).toBeGreaterThanOrEqual(board.x);
  expect(k.x + k.width).toBeLessThanOrEqual(board.x + board.width);
  await page.goto("/demo?wait=opponent");
  await expect(page.locator(".primary-dock .waiting-opp")).toBeVisible();
  await expect(page.locator(".intent-empty")).toHaveCount(0);
});

// Mulligan floats over the board in the desktop dock, so its fill must be opaque (#461).
test("the Mulligan button has a solid background, not see-through (#461)", async ({ page }) => {
  await page.goto("/demo?turn0");
  await page.locator(".board-root").waitFor();
  const redo = page.getByRole("button", { name: /^Mulligan/ });
  await expect(redo).toBeVisible();
  const bg = await redo.evaluate((el) => getComputedStyle(el).backgroundColor);
  const m = bg.match(/^rgba?\(([^)]+)\)$/);
  expect(m, `unparseable background ${bg}`).not.toBeNull();
  const parts = m![1].split(/[\s,/]+/).filter(Boolean);
  const alpha = parts.length > 3 ? Number(parts[3]) : 1;
  expect(alpha, `background was ${bg}`).toBe(1);
});

// The opponent hand pins above the top of the playmat (left, centre or right)
// instead of its side panel, and drags back into a column (#264).
test("the opponent hand pins to the top of the mat, stays after a reload, and drags back to a column (#264)", async ({ page, duel }, info) => {
  test.skip(info.project.name !== "desktop-1280", "side panels move on desktop only");
  await page.goto("/demo?full");
  await page.locator(".board-root").waitFor();
  const drag = async (to: (box: { x: number; y: number; width: number; height: number }) => { x: number; y: number }, target: string) => {
    const panel = page.locator('[data-panel="oppHand"]');
    await panel.hover();
    const grip = (await panel.locator("> .panel-grip").boundingBox())!;
    const box = (await page.locator(target).first().boundingBox())!;
    await page.mouse.move(grip.x + grip.width / 2, grip.y + grip.height / 2);
    await page.mouse.down();
    const p = to(box);
    await page.mouse.move(p.x, p.y, { steps: 6 });
  };
  const inColumn = () => page.locator('[data-panel-col] > [data-panel="oppHand"]').count();

  // Over the top of the opponent's mat, right third: a dashed spot shows.
  await drag((m) => ({ x: m.x + m.width * 0.85, y: m.y + 10 }), ".side-field.side-opp");
  await expect(page.locator(".panel-drop-spot")).toBeVisible();
  await page.mouse.up();
  await expect(page.locator(".opp-hand-mat-right .opp-hand-corner")).toBeVisible();
  expect(await inColumn()).toBe(0);
  // It sits above the opponent's mat, not over its cards.
  const hand = (await page.locator(".opp-hand-mat").boundingBox())!;
  const mat = (await page.locator(".side-field.side-opp").boundingBox())!;
  expect(hand.y + hand.height).toBeLessThanOrEqual(mat.y + 1);
  const issues = (await duel.audit()).filter((i) => !isKnown(i));
  if (issues.length) await page.screenshot({ path: info.outputPath("audit.png") });
  expect(issues, formatIssues(issues)).toEqual([]);

  await page.reload();
  await expect(page.locator(".opp-hand-mat-right .opp-hand-corner")).toBeVisible();

  // Back into the right column, above Turn and clocks.
  await drag((t) => ({ x: t.x + t.width / 2, y: t.y + 6 }), '[data-panel="turn"]');
  await expect(page.locator(".panel-drop-line")).toBeVisible();
  await page.mouse.up();
  await expect(page.locator(".opp-hand-mat")).toHaveCount(0);
  await expect.poll(inColumn).toBe(1);
  expect(duel.errors).toEqual([]);
});

// Block step: dragging a Counter onto the defender passes the block and plays
// that Counter in one gesture (desktop: from the hand, phone: from the tray).
test("dragging a Counter onto the defender in the block step skips the block and counters (#300)", async ({ page }) => {
  await page.goto("/demo?counter=block");
  await page.locator(".board-root").waitFor();
  const phone = test.info().project.name === "phone-375";
  const source = phone
    ? page.locator('.defend-chip-early[data-hand-card-id="y-h1"]')
    : page.locator(":is(.hand-fan-cards, .rail-hand-cards, .hand-dock-cards, .hand-row-inner) > .card-tile").first();
  const leader = page.locator('.side-you .card-tile[data-instance-id="y-leader"]').first();
  await expect(source).toBeVisible();
  // Let the turn splash clear: it sits over the Leader.
  await page.waitForTimeout(2500);
  const to = (await leader.boundingBox())!;
  // The desktop fan overlaps and peeks up from the bottom edge: grab a point
  // where the dragged card itself is on top.
  const [sx, sy] = await source.evaluate((el) => {
    const r = el.getBoundingClientRect();
    for (let y = r.top + 6; y < Math.min(r.bottom, innerHeight); y += 4) {
      for (let x = r.left + 4; x < r.right; x += 4) {
        if (document.elementFromPoint(x, y)?.closest(".card-tile, .defend-chip") === el) return [x, y];
      }
    }
    return [r.left + r.width / 2, r.top + r.height / 2];
  });
  await page.mouse.move(sx, sy);
  await page.mouse.down();
  // Small first steps on the card, or the drag never arms.
  for (let i = 1; i <= 4; i += 1) await page.mouse.move(sx, sy + i * 3);
  await page.mouse.move(to.x + to.width / 2, to.y + to.height / 2, { steps: 12 });
  await page.mouse.up();
  await expect
    .poll(() => page.evaluate(() => (window as { __demoIntents?: unknown[] }).__demoIntents))
    .toEqual([{ type: "pass_block" }, { type: "counter_from_hand", handIndex: 0 }]);
});

// Block step: tapping a Counter under "skip block" in the Defend tray, then the
// primary button, plays that Counter. Desktop's right-rail tray has no Confirm
// step, so its tap must play the card; a staged one was dropped by "Resolve".
test("a Counter tapped from the Defend tray in the block step is played, not left staged (#286)", async ({ page }) => {
  await page.goto("/demo?counter=block");
  await page.locator(".board-root").waitFor();
  const sent = () => page.evaluate(() => (window as { __demoIntents?: unknown[] }).__demoIntents ?? []);
  const chip = page.locator('.defend-chip-early[data-hand-card-id="y-h1"]');
  await expect(chip).toBeVisible();
  // Let the turn splash clear before tapping.
  await page.waitForTimeout(2500);
  await chip.click();
  // The block step closes; the counter step opens.
  await expect(page.locator(".defend-chip-early")).toHaveCount(0);
  await expect.poll(sent).toContainEqual({ type: "pass_block" });
  await page.locator(".intent-btn-primary:visible").click();
  await expect
    .poll(async () => (await sent()).slice(0, 2))
    .toEqual([{ type: "pass_block" }, { type: "counter_from_hand", handIndex: 0 }]);
});

// Hand sort off: a hand card dropped back on the hand moves there instead of
// being played; dropped on the board it is still played.
for (const handLayout of ["fan", "grid"]) {
  test(`${handLayout} hand cards drag to a new spot in the hand when Sort is off, and still play on the board (#294)`, async ({ page }) => {
    await page.addInitScript(
      (layout) => localStorage.setItem("optcg-duel:settings", JSON.stringify({ handLayout: layout })),
      handLayout,
    );
    await page.goto("/demo");
    await page.locator(".board-root").waitFor();
    const cards = page.locator(
      ".hand-fan-cards > .card-tile, .hand-row-inner > .card-tile, .rail-hand-cards > .card-tile, .hand-dock-cards > .card-tile",
    );
    const order = () => cards.evaluateAll((els) => els.map((e) => e.getAttribute("data-motion-id")));
    const sent = () => page.evaluate(() => (window as { __demoIntents?: unknown[] }).__demoIntents ?? []);
    const touch = test.info().project.name === "phone-375";
    type Box = { x: number; y: number; width: number; height: number };
    // Drag hand card `from` to a point worked out once the hand is raised under the pointer.
    const drag = async (from: number, to: (box: (i: number) => Promise<Box>) => Promise<{ x: number; y: number }>) => {
      // A pointer left on a card's edge after the last drop can keep the fan rising and tucking.
      if (!touch) await page.mouse.move(4, 4);
      // The last drop's slide (#338) and the fan's rise / tuck must settle before the cards are measured.
      await page.waitForFunction(() =>
        document
          .getAnimations()
          .every((a) => a.playState !== "running" || a.effect?.getTiming().iterations === Infinity),
      );
      const box = async (i: number) => (await cards.nth(i).boundingBox())!;
      let b = await box(from);
      if (!touch) {
        await page.mouse.move(b.x + b.width / 2, b.y + 12);
        await page.waitForTimeout(450);
        b = await box(from);
      }
      const start = { x: b.x + b.width / 2, y: b.y + b.height / 2 };
      const end = await to(box);
      if (touch) {
        // Lift the card a little first: a sideways pan scrolls the hand row.
        const cdp = await page.context().newCDPSession(page);
        await cdp.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [start] });
        for (const p of [{ x: start.x, y: start.y - 16 }, { x: end.x, y: start.y - 16 }, end]) {
          await cdp.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: [p] });
          await page.waitForTimeout(30);
        }
        await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
        return;
      }
      await page.mouse.move(start.x, start.y);
      await page.mouse.down();
      await page.mouse.move(start.x, start.y - 14, { steps: 4 });
      await page.mouse.move(end.x, end.y, { steps: 10 });
      await page.mouse.up();
    };
    const before = await order();
    expect(before.length).toBeGreaterThan(3);
    const [h1, h2, h3, h4, ...rest] = before;

    // Hand card 0 is playable: dropped on the right half of the third card it moves past it, unplayed.
    await drag(0, async (box) => {
      const third = await box(2);
      return { x: third.x + third.width * 0.85, y: third.y + third.height / 2 };
    });
    await expect.poll(order).toEqual([h2, h3, h1, h4, ...rest]);
    expect(await sent()).toEqual([]);

    // A card with nothing to play moves too: the fourth card goes first.
    await drag(3, async (box) => {
      const first = await box(0);
      return { x: first.x + 6, y: first.y + first.height / 2 };
    });
    await expect.poll(order).toEqual([h4, h2, h3, h1, ...rest]);
    expect(await sent()).toEqual([]);

    // Dropped on the board, a playable card is still played.
    await drag(3, async () => {
      const field = (await page.locator('.side-you [data-dnd-drop="play_field"]').first().boundingBox())!;
      return { x: field.x + field.width / 2, y: field.y + field.height / 2 };
    });
    await expect.poll(sent).toEqual([{ type: "play_card", handIndex: 0 }]);
  });
}

// A floating fan over your field: a card dragged out of it and back down onto
// a field zone under it is played. Coming back over the fan used to count as
// a drop in the hand, so it was moved there instead (#294).
test("a card dragged out of a floating fan onto the board under it is played, not reordered (#294)", async ({ page }) => {
  test.skip(test.info().project.name !== "desktop-1280", "the floating fan is desktop only");
  await page.addInitScript(() =>
    localStorage.setItem("optcg-duel:settings", JSON.stringify({ handLayout: "fan", handFanPos: "0.5,0.78" })),
  );
  await page.goto("/demo?full");
  await page.locator(".board-root").waitFor();
  await expect(page.locator(".hand-fan")).toHaveClass(/hand-fan-float/);
  const cards = page.locator(".hand-fan-cards > .card-tile");
  const order = () => cards.evaluateAll((els) => els.map((e) => e.getAttribute("data-motion-id")));
  const sent = () => page.evaluate(() => (window as { __demoIntents?: unknown[] }).__demoIntents ?? []);
  const before = await order();
  const fan = (await page.locator(".hand-fan").boundingBox())!;
  const field = (await page.locator('.side-you [data-dnd-drop="play_field"]').first().boundingBox())!;
  const drop = { x: field.x + field.width / 2, y: field.y + field.height / 2 };
  // The field zone really is under the fan here.
  expect(drop.y).toBeGreaterThan(fan.y);
  expect(drop.y).toBeLessThan(fan.y + fan.height);

  const b = (await cards.first().boundingBox())!;
  const start = { x: b.x + b.width / 2, y: b.y + b.height / 2 };
  await page.mouse.move(start.x, start.y);
  await page.mouse.down();
  await page.mouse.move(start.x, start.y - 14, { steps: 4 });
  // Out above the fan, then down onto the field under it.
  await page.mouse.move(drop.x, fan.y - 40, { steps: 10 });
  await page.mouse.move(drop.x, drop.y, { steps: 10 });
  await page.mouse.up();
  await expect.poll(sent).toEqual([expect.objectContaining({ type: "play_card", handIndex: 0 })]);
  expect(await order()).toEqual(before);
});

// The trash browser shows readable cards, not the tiny board tile (#287).
test("trash viewer cards are big enough to read (#287)", async ({ page, duel }, info) => {
  await page.goto("/demo");
  await page.locator(".board-root").waitFor();
  await page.locator(".side-you .zone-trash .zone-pile").click();
  const tile = page.locator(".trash-viewer-grid .card-tile").first();
  await tile.waitFor();
  const box = (await tile.boundingBox())!;
  const phone = info.project.name === "phone-375";
  expect(box.width).toBeGreaterThanOrEqual(phone ? 90 : 140);
  const issues = (await duel.audit()).filter((i) => !isKnown(i));
  expect(issues, formatIssues(issues)).toEqual([]);
});

// "By card" folds duplicate trash cards into one tile with a ×N badge (#380).
test("trash viewer By card groups duplicates under a count badge (#380)", async ({ page, duel }) => {
  await page.addInitScript(() => localStorage.removeItem("duel.trashSort"));
  // 8 trash cards cycling through 3 distinct ones.
  await page.goto("/demo?trash=8");
  await page.locator(".board-root").waitFor();
  await page.locator(".side-you .zone-trash .zone-pile").click();
  const tiles = page.locator(".trash-viewer-grid .card-tile");
  await expect(tiles).toHaveCount(8);
  await expect(page.locator(".trash-viewer-count")).toHaveCount(0);
  const done = page.locator(".trash-viewer-done");
  const before = (await done.boundingBox())!;

  await page.getByRole("button", { name: "By card" }).click();
  await expect(tiles).toHaveCount(3);
  await expect(page.locator(".trash-viewer-count").first()).toHaveText("×3");
  await expect(page.locator(".trash-viewer-sub")).toHaveText("8 cards · 3 different");
  const after = (await done.boundingBox())!;
  expect(after.x).toBe(before.x);
  expect(after.y).toBe(before.y);
  const issues = (await duel.audit()).filter((i) => !isKnown(i));
  expect(issues, formatIssues(issues)).toEqual([]);

  // The choice sticks the next time a trash is opened.
  await page.keyboard.press("Escape");
  await page.locator(".side-you .zone-trash .zone-pile").click();
  await expect(tiles).toHaveCount(3);
  await page.getByRole("button", { name: "Newest" }).click();
  await expect(tiles).toHaveCount(8);
});

// Only a card's owner may change its alt art: the opponent's Guard Point from
// Recent plays has no Artwork row, your own Guard Point in your trash does (#287).
test("an opponent's card opened from Recent plays offers no art change (#287)", async ({ page }) => {
  test.skip(test.info().project.name !== "desktop-1280", "Recent plays is a desktop side panel");
  await page.goto("/demo?full");
  await page.locator(".board-root").waitFor();
  await page.locator(".recent-play-opp", { hasText: "Guard Point" }).first().click({ button: "right" });
  await expect(page.locator(".card-inspect-name")).toHaveText("Guard Point");
  await expect(page.locator(".card-inspect-alts")).toHaveCount(0);
  await page.keyboard.press("Escape");

  await page.locator(".side-you .zone-trash .zone-pile").click();
  await page.locator(".trash-viewer-grid .card-tile", { hasText: "Guard Point" }).click();
  await expect(page.locator(".card-inspect-name")).toHaveText("Guard Point");
  await expect(page.locator(".card-inspect-alts")).toHaveCount(1);
});

// Right-click the trash for the top card's details; a left click still opens the whole trash (#287).
test("right-clicking the trash shows the top card, left click opens the trash (#287)", async ({ page }) => {
  test.skip(test.info().project.name !== "desktop-1280", "right-click is a mouse gesture");
  await page.goto("/demo?full");
  await page.locator(".board-root").waitFor();
  const pile = page.locator(".side-you .zone-trash .zone-pile");
  await pile.click({ button: "right" });
  await expect(page.locator(".card-inspect-name")).toBeVisible();
  const name = await page.locator(".card-inspect-name").innerText();
  await expect(page.locator(".trash-viewer")).toHaveCount(0);
  await page.keyboard.press("Escape");
  await expect(page.locator(".card-inspect")).toHaveCount(0);

  await pile.click();
  await expect(page.locator(".trash-viewer-grid .card-tile").first()).toContainText(name);
  await expect(page.locator(".card-inspect")).toHaveCount(0);
});

// "Opponent hand, top right" used to only restyle the side panel's fan on
// desktop. It is now the top-right spot: pinned on the mat on desktop, the
// right of the opponent's half on phones, where the switch still lives (#297).
test("Opponent hand, top right pins the hand top right on desktop and phones (#297)", async ({ page, duel }, info) => {
  const desktop = info.project.name === "desktop-1280";
  // A setting saved by an older build.
  await page.addInitScript(() => {
    if (!localStorage.getItem("optcg-duel:settings")) {
      localStorage.setItem("optcg-duel:settings", JSON.stringify({ oppHandTopRight: true }));
    }
  });
  await page.goto("/demo?full");
  await page.locator(".board-root").waitFor();
  if (desktop) {
    await expect(page.locator(".opp-hand-mat-right .opp-hand-corner")).toBeVisible();
    await expect(page.locator('[data-panel-col] > [data-panel="oppHand"]')).toHaveCount(0);
  } else {
    await expect(page.locator(".opp-hand-hint-right .opp-hand-corner")).toBeVisible();
  }
  const issues = (await duel.audit()).filter((i) => !isKnown(i));
  if (issues.length) await page.screenshot({ path: info.outputPath("audit.png") });
  expect(issues, formatIssues(issues)).toEqual([]);

  await page.goto("/settings");
  const toggle = page.getByLabel("Opponent hand, top right");
  if (desktop) {
    // Desktop picks the spot from the Opponent hand position list instead.
    await expect(toggle).toHaveCount(0);
    await expect(page.getByLabel("Opponent hand position")).toHaveValue("right");
    return;
  }
  await expect(toggle).toBeChecked();
  await toggle.uncheck();
  await page.goto("/demo?full");
  await page.locator(".board-root").waitFor();
  await expect(page.locator(".opp-hand-hint-right")).toHaveCount(0);
  await expect(page.locator(".opp-hand-hint")).toBeVisible();
  expect(duel.errors).toEqual([]);
});

// Face-up Life (Shiryu OP16-108 and friends) shows its art on both mats; portrait phones list the opponent's on the count chip.
test("face-up Life cards show face up on both mats (#327)", async ({ page }) => {
  await page.goto("/demo?faceup=1");
  await page.locator(".board-root").waitFor();
  await expect(page.locator(".side-you .zone-pile-life .zone-pile-face.is-face-up")).toHaveCount(1);
  const oppPile = page.locator(".side-opp .zone-pile-life .zone-pile-face.is-face-up");
  const oppChip = page.locator(".side-opp .count-chip-extra", { hasText: "1\u2191" });
  await expect(oppPile.or(oppChip)).toHaveCount(1);
});
