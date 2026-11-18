import { expect, formatIssues, test } from "./fixtures";

test.afterEach(({ planner }) => {
  expect(planner.errors).toEqual([]);
});

const SIZES = [
  { width: 375, height: 812 },
  { width: 1280, height: 800 },
  { width: 1920, height: 1080 },
  { width: 2560, height: 1440 },
];

test("leader stats never wrap, collide or leave their card from phone to 2560px (#1359)", async ({ page, planner }, testInfo) => {
  test.skip(testInfo.project.name !== "desktop-1200", "viewport is set by the test");
  for (const size of SIZES) {
    await page.setViewportSize(size);
    await planner.open("/meta");
    await expect(page.locator(".meta-leader-card").first()).toBeVisible();
    const problems = await page.evaluate(() => {
      const out: string[] = [];
      const textBox = (el: Element) => {
        const r = document.createRange();
        r.selectNodeContents(el);
        return { box: r.getBoundingClientRect(), lines: r.getClientRects().length };
      };
      for (const card of document.querySelectorAll(".meta-leader-card")) {
        const name = card.querySelector("h2")?.textContent ?? "?";
        const cardBox = card.getBoundingClientRect();
        const boxes: { label: string; l: number; r: number; t: number; b: number }[] = [];
        for (const cell of card.querySelectorAll(".meta-stats > div")) {
          const dt = cell.querySelector("dt")!;
          const dd = cell.querySelector("dd")!;
          const label = dt.textContent ?? "";
          if (textBox(dt).lines !== 1) out.push(`${name}: "${label}" label wraps`);
          const dtBox = textBox(dt).box;
          const ddBox = textBox(dd).box;
          for (const [what, b] of [["label", dtBox], ["value", ddBox]] as const) {
            if (b.left < cardBox.left || b.right > cardBox.right - 1 || b.bottom > cardBox.bottom)
              out.push(`${name}: ${label} ${what} leaves the card`);
          }
          boxes.push({ label, l: Math.min(dtBox.left, ddBox.left), r: Math.max(dtBox.right, ddBox.right), t: dtBox.top, b: ddBox.bottom });
        }
        for (let i = 0; i < boxes.length; i++)
          for (let j = i + 1; j < boxes.length; j++) {
            const a = boxes[i];
            const c = boxes[j];
            if (a.l < c.r && c.l < a.r && a.t < c.b && c.t < a.b) out.push(`${name}: ${a.label} overlaps ${c.label}`);
          }
      }
      return out;
    });
    expect(problems, `${size.width}px:\n${problems.join("\n")}`).toEqual([]);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  }
});

test("searching and picking a colour narrow the leader grid, and Clear filters brings it back (#1359)", async ({ page, planner }) => {
  await planner.open("/meta");
  const names = page.locator(".meta-leader-card h2");
  await expect(names).toHaveCount(12);

  await page.getByRole("searchbox", { name: "Search leaders" }).fill("op17-0");
  await expect(names).toHaveText(["Rocks.D.Xebec", "Monkey.D.Luffy", "Kaido", "Shanks", "Edward.Newgate"]);
  await expect(page).toHaveURL(/q=op17-0/);

  await page.getByRole("button", { name: "Black", exact: true }).click();
  await expect(names).toHaveText(["Monkey.D.Luffy"]);
  await expect(page).toHaveURL(/colors=black/);

  await page.getByRole("searchbox", { name: "Search leaders" }).fill("zzz");
  await expect(page.getByText("No leaders match")).toBeVisible();
  await page.getByRole("button", { name: "Clear filters" }).click();
  await expect(names).toHaveCount(12);
  await expect(page).toHaveURL(/\/meta$/);
  const issues = await planner.audit();
  expect(issues, formatIssues(issues)).toEqual([]);
});

test("a two-colour leader shows under either of its colours and Sort changes the order (#1359)", async ({ page, planner }) => {
  await planner.open("/meta?colors=yellow");
  await expect(page.locator(".meta-leader-card h2")).toHaveText(["Nico Robin", "Charlotte Pudding", "Boa Hancock"]);
  await page.locator(".meta-toolbar .meta-select").first().getByRole("button").click();
  await page.getByRole("option", { name: "Top 8" }).click();
  await expect(page).toHaveURL(/sort=top8/);
  await expect(page.locator(".meta-leader-card h2")).toHaveText(["Nico Robin", "Boa Hancock", "Charlotte Pudding"]);
});
