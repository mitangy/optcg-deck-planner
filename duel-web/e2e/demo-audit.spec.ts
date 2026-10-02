/**
 * UI audit of every /demo fixture screen (prompts, full board, statuses,
 * match over, …) at each project's screen size. The fixtures cover prompt
 * states a random playthrough rarely reaches.
 */
import { test, expect, formatIssues } from "./fixtures";
import { isKnown } from "./known-issues";

const SCREENS = [
  "",
  "?turn0",
  "?full",
  "?statuses",
  "?over",
  "?undo=ask",
  ...["don", "don2", "look", "satori", "rest", "select", "restgrid", "selectgrid", "confirm", "order", "effects", "mode"].map((p) => `?prompt=${p}`),
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
    await page.goto(`/demo${screen}`);
    await page.locator(".board-root").waitFor();
    const issues = (await duel.audit()).filter((i) => !isKnown(i));
    if (issues.length) await page.screenshot({ path: info.outputPath("audit.png") });
    expect(issues, formatIssues(issues)).toEqual([]);
    expect(duel.errors).toEqual([]);
  });
}

// A clicked hand card, Sort or Hand button keeps focus; the fan must still tuck
// once the pointer leaves it, or it sits on your DON!! row (flat board).
test("the centre hand fan tucks away after a click once the pointer leaves", async ({ page }) => {
  test.skip(test.info().project.name !== "desktop-1280", "the fan is desktop only");
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
