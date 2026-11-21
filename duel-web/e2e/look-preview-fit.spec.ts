import { test, expect } from "./fixtures";

const SHOT_DIR = process.env.LOOK_PREVIEW_SHOTS ?? "";

const SIZES = [
  { project: "phone-375", name: "phone-320x700", width: 320, height: 700 },
  { project: "phone-375", name: "phone-375x812", width: 375, height: 812 },
  { project: "phone-375", name: "phone-812x375-landscape", width: 812, height: 375 },
  { project: "desktop-1280", name: "desktop-1280x720", width: 1280, height: 720 },
];

type Box = { x: number; y: number; width: number; height: number };

const within = (inner: Box, outer: Box) =>
  inner.x >= outer.x - 1 &&
  inner.y >= outer.y - 1 &&
  inner.x + inner.width <= outer.x + outer.width + 1 &&
  inner.y + inner.height <= outer.y + outer.height + 1;

const intersects = (a: Box, b: Box) => a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height;

for (const size of SIZES) {
  test(`the Appearance preview keeps the DON!! fan and the deck inside the frame at ${size.name} (#1407)`, async ({ page }, info) => {
    test.skip(info.project.name !== size.project, `${size.name} runs in ${size.project}`);
    await page.setViewportSize({ width: size.width, height: size.height });
    await page.goto("/settings");
    const preview = page.locator("#appearance .look-preview");
    await preview.scrollIntoViewIfNeeded();
    await expect(preview.locator(".look-preview-card")).toHaveCount(6);
    await page.waitForTimeout(300);
    if (SHOT_DIR) {
      await preview.screenshot({ path: `${SHOT_DIR}/${size.name}-preview.png` });
      await page.screenshot({ path: `${SHOT_DIR}/${size.name}-viewport.png` });
    }
    const frame = (await preview.boundingBox())!;
    const zones = await preview.locator(".look-preview-zone").all();
    const cards = await preview.locator(".look-preview-card").all();
    expect(zones).toHaveLength(2);
    for (const [i, zone] of zones.entries()) {
      const box = (await zone.boundingBox())!;
      expect(within(box, frame), `zone ${i} ${JSON.stringify(box)} inside ${JSON.stringify(frame)}`).toBe(true);
    }
    for (const [i, card] of cards.entries()) {
      const box = (await card.boundingBox())!;
      expect(within(box, frame), `card ${i} ${JSON.stringify(box)} inside ${JSON.stringify(frame)}`).toBe(true);
    }
    const tag = (await preview.locator(".look-preview-tag").boundingBox())!;
    for (const [i, zone] of zones.entries()) {
      expect(intersects(tag, (await zone.boundingBox())!), `tag clear of zone ${i}`).toBe(false);
    }
  });
}
