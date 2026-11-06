/**
 * Importing OPTCGSim games into Log Pose (#1030), clicked through Settings > Log Pose.
 *
 * The planner API is faked in the browser: the import route keeps the games it is sent, skips a match key it
 * already has and a record with no result, and answers like the real one. What it proves: an export file is
 * imported and the result says how many were skipped and why, a pasted combat log asks which player you were
 * (and sends that player and the result), Clear removes them all, and none of it moves the controls or makes the
 * page scroll sideways, on a desktop, a portrait phone and a landscape phone.
 */
import { readFileSync } from "node:fs";
import { test, expect, signInAs, FAKE_API, type Page } from "./fixtures";

const LOG = (JSON.parse(readFileSync("../packages/rules/src/sim/optcgsim/__fixtures__/game-me-first-won.json", "utf8")) as { combatLog: string }).combatLog;
const SHOTS = process.env.E2E_SHOTS_DIR;

type Posted = { games: Record<string, unknown>[] };

async function fakePlanner(page: Page) {
  const kept = new Set<string>();
  const posts: Posted[] = [];
  await page.route(`${FAKE_API}/analyst/**`, (route) => {
    const req = route.request();
    const path = new URL(req.url()).pathname;
    const cors = { "access-control-allow-origin": process.env.E2E_PAGE_ORIGIN ?? "http://127.0.0.1:5174", "access-control-allow-credentials": "true", "access-control-allow-headers": "content-type", "access-control-allow-methods": "GET, POST, DELETE, OPTIONS" };
    if (req.method() === "OPTIONS") return route.fulfill({ status: 204, headers: cors });
    const json = (body: unknown) => route.fulfill({ status: 200, headers: cors, json: body });
    if (path === "/analyst/token") return json({ has_token: false, created_at: null });
    if (path === "/analyst/sharing") return json({ share_matches: true });
    if (path === "/analyst/lessons/review") return json({ lessons: [] });
    if (path === "/analyst/sim-games/import") {
      const body = JSON.parse(req.postData() ?? "{}") as Posted;
      posts.push(body);
      let imported = 0, dup = 0, invalid = 0;
      for (const g of body.games) {
        if (g.result !== "Won" && g.result !== "Lost") invalid++;
        else if (kept.has(String(g.matchKey))) dup++;
        else (kept.add(String(g.matchKey)), imported++);
      }
      return json({ imported, skipped_duplicates: dup, skipped_invalid: invalid, total: body.games.length });
    }
    if (path === "/analyst/sim-games" && req.method() === "DELETE") {
      const deleted = kept.size;
      kept.clear();
      return json({ deleted });
    }
    if (path === "/analyst/sim-games") return json({ games: [], total: kept.size });
    return route.fulfill({ status: 404, headers: cors, json: { detail: "not in e2e fake API" } });
  });
  return { posts, kept };
}

const game = (key: string, over: Record<string, unknown> = {}) => ({ matchKey: key, result: "Won", playerName: "PlayerA#1", decklist: ["4xOP16-104"], oppDecklist: ["4xOP16-063"], ...over });

async function open(page: Page) {
  await signInAs(page, { uid: 7, name: "sim" });
  const planner = await fakePlanner(page);
  await page.goto("/settings#log-pose");
  const panel = page.locator(".sim-import");
  await panel.scrollIntoViewIfNeeded();
  await expect(panel.getByText("No OPTCGSim games imported yet.")).toBeVisible();
  return { planner, panel };
}

const round = (b: { x: number; y: number; width: number; height: number } | null) => (b ? [b.x, b.y, b.width, b.height].map(Math.round) : null);

async function flow(page: Page, shot: string) {
  const { planner, panel } = await open(page);
  const importBtn = panel.getByRole("button", { name: "Import", exact: true });
  const clearBtn = panel.getByRole("button", { name: "Clear imported games" });
  const textarea = panel.getByLabel("Paste one OPTCGSim combat log");
  await expect(clearBtn).toBeDisabled();
  const before = [round(await importBtn.boundingBox()), round(await textarea.boundingBox())];

  // An export file: two new games, one repeated, one with no result.
  const file = JSON.stringify([game("key-aaaaaaaa"), game("key-bbbbbbbb", { result: "Lost" }), game("key-aaaaaaaa"), game("key-cccccccc", { result: "" })]);
  await panel.getByLabel("OPTCGSim export file").setInputFiles({ name: "optcgsim-matches.json", mimeType: "application/json", buffer: Buffer.from(file) });
  await expect(panel.getByRole("status")).toHaveText("Imported 2, skipped 2 (1 already imported, 1 not usable).");
  await expect(panel.getByText("2 OPTCGSim games imported.")).toBeVisible();
  expect(planner.posts).toHaveLength(1);
  expect(planner.posts[0]!.games).toHaveLength(4);
  expect([round(await importBtn.boundingBox()), round(await textarea.boundingBox())]).toEqual(before);
  await expect(clearBtn).toBeEnabled();

  // A pasted log: say which player you were.
  const mine = panel.getByLabel("I played as");
  await expect(mine).toBeDisabled();
  await textarea.fill(LOG);
  await expect(mine).toBeEnabled();
  await expect(mine.locator("option")).toHaveText(["PlayerA#1 (OP16-080)", "PlayerB#2 (OP16-060)"]);
  expect([round(await importBtn.boundingBox()), round(await textarea.boundingBox())]).toEqual(before);
  await mine.selectOption({ index: 1 });
  await panel.getByLabel("Result").selectOption("lost");
  await importBtn.click();
  await expect(panel.getByRole("status")).toHaveText("Imported 1.");
  await expect(panel.getByText("3 OPTCGSim games imported.")).toBeVisible();
  const sent = planner.posts[1]!.games[0]!;
  expect(sent).toMatchObject({ playerName: "PlayerB#2", playerLeader: "OP16-060", oppLeader: "OP16-080", result: "Lost" });
  expect(String(sent.matchKey)).toMatch(/^paste-/);
  await expect(textarea).toHaveValue("");

  // The same log again is a duplicate.
  await textarea.fill(LOG);
  await importBtn.click();
  await expect(panel.getByRole("status")).toHaveText("Imported 0, skipped 1 (1 already imported).");

  // Something that is not an export.
  await textarea.fill("not a game");
  await importBtn.click();
  await expect(panel.getByRole("alert")).toHaveText(/not an OPTCGSim export/);

  await textarea.fill("");
  if (SHOTS) await panel.screenshot({ path: `${SHOTS}/${shot}.png` });
  // Declining the question keeps every game.
  page.once("dialog", (d) => void d.dismiss());
  await clearBtn.click();
  await expect(panel.getByText("3 OPTCGSim games imported.")).toBeVisible();
  page.once("dialog", (d) => {
    expect(d.message()).toMatch(/Remove all your imported OPTCGSim games/);
    void d.accept();
  });
  await clearBtn.click();
  await expect(panel.getByRole("status")).toHaveText("Removed 3 imported games.");
  await expect(panel.getByText("No OPTCGSim games imported yet.")).toBeVisible();
  await expect(clearBtn).toBeDisabled();

  const sideways = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  expect(sideways).toBeLessThanOrEqual(0);
  const box = (await panel.boundingBox())!;
  expect(box.x).toBeGreaterThanOrEqual(0);
  expect(box.x + box.width).toBeLessThanOrEqual((await page.viewportSize())!.width);
}

test("imports an export file and a pasted log, then clears them (#1030)", async ({ page }) => {
  await flow(page, test.info().project.name === "phone-375" ? "portrait-375" : "desktop-1280");
});

test("fits a landscape phone (#1030)", async ({ page }) => {
  test.skip(test.info().project.name !== "phone-375", "one landscape run is enough");
  await page.setViewportSize({ width: 812, height: 375 });
  await flow(page, "landscape-812");
});
