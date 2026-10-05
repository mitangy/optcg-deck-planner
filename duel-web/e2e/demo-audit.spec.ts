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
    localStorage.setItem("optcg-duel:settings", JSON.stringify({ keepHandOpen: true })),
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
  await page.mouse.move(grip.x + 200, 360, { steps: 8 });
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

// With every panel in one column the Actions panel shrank to its title.
test("Actions keeps room for its buttons with every panel in the right column (#261)", async ({ page }, info) => {
  test.skip(info.project.name !== "desktop-1280", "side panels move on desktop only");
  await page.addInitScript(() =>
    localStorage.setItem(
      "optcg-duel:settings",
      JSON.stringify({ panelLayout: "|oppHand,turn,actions,preview,recent,log,hand,chat" }),
    ),
  );
  await page.goto("/demo?full");
  await page.locator(".board-root").waitFor();
  const actions = (await page.locator('[data-panel="actions"]').boundingBox())!;
  expect(actions.height).toBeGreaterThanOrEqual(80);
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
  "/": [".home-kicker"],
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

// The desktop action rail says why it is empty instead of "No legal actions"
// while you answer a prompt or wait on the opponent (#262).
test("the action rail says to answer the prompt or that it is waiting (#262)", async ({ page }, info) => {
  test.skip(info.project.name !== "desktop-1280", "the desktop rail");
  await page.goto("/demo?prompt=select");
  await expect(page.locator(".intent-empty")).toHaveText("Answer the prompt to continue");
  await page.goto("/demo?wait=opponent");
  await expect(page.locator(".intent-empty")).toHaveText("Waiting for your opponent…");
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
