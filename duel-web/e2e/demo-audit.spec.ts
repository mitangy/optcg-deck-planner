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
  ...["don", "look", "satori", "rest", "select", "confirm", "order", "effects", "mode"].map((p) => `?prompt=${p}`),
  ...["look", "satori", "effects"].map((p) => `?float&prompt=${p}`),
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
