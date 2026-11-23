import { test, expect } from "./fixtures";

test.use({ legacyLayout: false });

for (const size of [
  { name: "phone portrait", width: 375, height: 812 },
  { name: "phone landscape", width: 812, height: 375 },
  { name: "desktop", width: 1280, height: 720 },
  { name: "narrowest card", width: 320, height: 640 },
]) {
  test(`Match over buttons fit their labels when the opponent left, ${size.name} (#1424)`, async ({ page }, info) => {
    test.skip(info.project.name !== "desktop-1280", "the test sets its own viewport");
    await page.setViewportSize({ width: size.width, height: size.height });
    await page.goto("/demo?over&rematch=left");
    const card = page.locator(".modal-card.match-result");
    await expect(card).toBeVisible();
    const buttons = card.locator(".match-result-secondary .btn");
    await expect(buttons).toHaveText(["Review game", "View board", "Return home"]);
    const cardBox = await card.evaluate((el) => {
      const r = el.getBoundingClientRect();
      return { left: r.left, right: r.right };
    });
    const rows = await buttons.evaluateAll((els) =>
      els.map((el) => {
        const b = el.getBoundingClientRect();
        const range = document.createRange();
        range.selectNodeContents(el);
        const t = range.getBoundingClientRect();
        return {
          label: el.textContent,
          overflowX: el.scrollWidth - el.clientWidth,
          overflowY: el.scrollHeight - el.clientHeight,
          textInside: t.left >= b.left - 0.5 && t.right <= b.right + 0.5 && t.top >= b.top - 0.5 && t.bottom <= b.bottom + 0.5,
          left: b.left,
          right: b.right,
        };
      }),
    );
    for (const r of rows) {
      expect(r.overflowX, `${r.label} scrollWidth`).toBeLessThanOrEqual(1);
      expect(r.overflowY, `${r.label} scrollHeight`).toBeLessThanOrEqual(1);
      expect(r.textInside, `${r.label} text inside its button`).toBe(true);
      expect(r.left).toBeGreaterThanOrEqual(cardBox.left);
      expect(r.right).toBeLessThanOrEqual(cardBox.right);
    }
  });
}
