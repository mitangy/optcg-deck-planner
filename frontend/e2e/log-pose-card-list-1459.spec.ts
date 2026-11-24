import { test, expect, DECK_ID } from "./fixtures";

// Screenshots only when SHOTS_DIR is set, and outside the repo.
const SHOTS_DIR = process.env.SHOTS_DIR;

const list = {
  id: "toolu_list",
  kind: "card_list",
  title: "Red Straw Hat Crew cards",
  leader_id: "ST01-001",
  cards: [
    { id: "ST01-003", name: "Karoo", type: "character", colors: ["red"], cost: 1, power: 3000, reason: "A cheap body." },
    { id: "ST01-004", name: "Usopp", type: "character", colors: ["red"], cost: 2, power: 4000, counter: 1000, reason: "Two-cost with a counter." },
  ],
};
const sse = (event: string, data: unknown) => `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;

test("Log Pose card art in a card list enlarges that card above the panel (#1459)", async ({ page, planner }, info) => {
  planner.enableLogPose();
  await planner.open(`/decks/${DECK_ID}`);
  await page.route("**/fake-analyst/chat", (route) =>
    route.fulfill({
      status: 200,
      contentType: "text/event-stream",
      body: sse("thread", { thread_id: 5 }) + sse("card_list", list) + sse("text", { delta: "These fit." }) + sse("done", { thread_id: 5 }),
    }),
  );
  await page.getByRole("button", { name: "Log Pose", exact: true }).click();
  const panel = page.getByRole("dialog", { name: "Log Pose" });
  await panel.getByLabel("Message Log Pose").fill("find red cheap cards");
  await panel.getByRole("button", { name: "Send", exact: true }).click();
  const enlarge = panel.getByRole("button", { name: "Enlarge Karoo" });
  await expect(enlarge).toBeVisible();
  await expect(enlarge.locator("img")).toHaveAttribute("src", /tcgplayer-cdn\.tcgplayer\.com\/product\/\d+_400w\.jpg/);
  if (SHOTS_DIR) await page.screenshot({ path: `${SHOTS_DIR}/${info.project.name}-1-card-list.png` });

  await enlarge.click();
  const lightbox = page.locator(".lightbox");
  await expect(lightbox).toBeVisible();
  const p = (await panel.boundingBox())!;
  const covered = await page.evaluate(([x, y]) => !!document.elementFromPoint(x, y)?.closest(".lightbox"), [p.x + p.width / 2, p.y + p.height / 2]);
  expect(covered).toBe(true);
  // The card is fully visible: on a phone the sheet leaves it room above, on desktop it sits beside the panel.
  const img = (await lightbox.locator(".lightbox-img").boundingBox())!;
  if (info.project.name === "phone-375") expect(img.y + img.height).toBeLessThanOrEqual(p.y);
  else expect(img.x + img.width).toBeLessThanOrEqual(p.x);
  if (SHOTS_DIR) await page.screenshot({ path: `${SHOTS_DIR}/${info.project.name}-2-enlarged.png` });
  await lightbox.locator(".lightbox-close").click();
  await expect(lightbox).toHaveCount(0);
});
