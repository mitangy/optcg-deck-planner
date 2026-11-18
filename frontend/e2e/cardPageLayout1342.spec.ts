import { expect, test } from "./fixtures";
import { mockCardApi, ZORO } from "./cardPageFake";

test.afterEach(({ planner }) => {
  expect(planner.errors).toEqual([]);
});

test("the card page links back to the page it was opened from, and a direct visit keeps the Meta link (#1342)", async ({ page, planner }) => {
  await mockCardApi(page);
  // Whatever card is picked on the list, the fake serves Zoro's page for it.
  await page.route("**/api/meta/cards/*", (route) => route.fallback({ url: route.request().url().replace(/cards\/[^/?]+/, `cards/${ZORO}`) }));
  await planner.open("/");
  await page.getByTitle("Expand card").filter({ visible: true }).first().click();
  await page.getByRole("dialog", { name: "Expanded card art" }).getByRole("link", { name: "Card page" }).click();
  await expect(page).toHaveURL(/\/cards\//);
  const back = page.locator(".card-head-info .eyebrow a");
  await expect(back).toHaveText("← Shopping");
  await expect(back).toHaveAttribute("href", "/");

  await planner.open(`/cards/${ZORO}`);
  await expect(page.locator(".card-head-info .eyebrow")).toHaveText("Meta decks · Card");
  await expect(page.locator(".card-head-info .eyebrow a")).toHaveAttribute("href", "/meta");
});

test("on a wide page Price and Tournament play fill both columns, and a phone stacks Arts, Price, Tournament play (#1342)", async ({ page, planner }, info) => {
  planner.signOut();
  await mockCardApi(page);
  await planner.open(`/cards/${ZORO}`);
  const arts = (await page.getByRole("region", { name: "Arts" }).boundingBox())!;
  const price = (await page.locator(".card-price").boundingBox())!;
  const play = (await page.getByRole("region", { name: "Tournament play" }).boundingBox())!;
  if (info.project.name === "phone-375") {
    expect(arts.y + arts.height).toBeLessThanOrEqual(price.y + 1);
    expect(price.y + price.height).toBeLessThanOrEqual(play.y + 1);
  } else {
    expect(price.x + price.width).toBeLessThanOrEqual(play.x + 1);
    expect(arts.x).toBeGreaterThanOrEqual(price.x + price.width - 1);
    expect(play.y).toBeGreaterThanOrEqual(arts.y + arts.height - 1);
  }
});
