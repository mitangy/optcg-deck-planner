import { expect, test } from "./fixtures";

test.afterEach(({ planner }) => {
  expect(planner.errors).toEqual([]);
});

test("the enlarged card shows its art and every action inside the screen, with the stepper named (#1342)", async ({ page, planner }, info) => {
  test.skip(info.project.name !== "desktop-1200", "phones stack the actions under the art and scroll");
  // A real scan is tall; the fixture's tiny placeholder would not fill the screen.
  await page.route(/_in_1000x1000/, (route) =>
    route.fulfill({ contentType: "image/svg+xml", body: '<svg xmlns="http://www.w3.org/2000/svg" width="716" height="1000"><rect width="716" height="1000" fill="#345"/></svg>' }),
  );
  await page.setViewportSize({ width: 1280, height: 720 });
  await planner.open("/");
  await page.getByTitle("Expand card").filter({ visible: true }).first().click();
  const lightbox = page.getByRole("dialog", { name: "Expanded card art" });
  const art = lightbox.locator(".lightbox-img");
  await expect(art).toBeVisible();
  await expect.poll(async () => (await art.boundingBox())!.height).toBeGreaterThan(500);

  const vp = page.viewportSize()!;
  const artBox = (await art.boundingBox())!;
  for (const sel of [".lightbox-card-link", ".shopping-extra-control", ".lightbox-alert", ".lightbox-history"]) {
    const box = (await lightbox.locator(`.lightbox-action ${sel}`).boundingBox())!;
    expect(box.y, sel).toBeGreaterThanOrEqual(0);
    expect(box.y + box.height, `${sel} bottom`).toBeLessThanOrEqual(vp.height);
    expect(box.x, `${sel} sits beside the art`).toBeGreaterThanOrEqual(artBox.x + artBox.width);
  }
  await expect(lightbox.getByRole("group", { name: "To buy" })).toBeVisible();
  const issues = await planner.audit();
  expect(issues).toEqual([]);
});
