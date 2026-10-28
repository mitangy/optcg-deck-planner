/** 08-ranked (5s): a ranked match with its seat clock, then the leaderboard with your highlighted row. */
import { sleep } from "../lib/util";
import { finishTake, newWindow, startTake } from "../lib/take";
import { MIKO, ZORO, profileDecks } from "../lib/data";
import { MIKO_STATS, friendsOfMiko, leaderboard } from "../lib/world";

export const id = "08-ranked";

export async function run(): Promise<void> {
  const board = leaderboard({ uid: MIKO.uid, name: MIKO.name, rating: MIKO_STATS.rating });
  const t = await startTake({
    id,
    gameSeed: 31,
    fake: { me: { ...MIKO, ...MIKO_STATS }, friends: friendsOfMiko(), leaderboard: board },
  });
  const p = t.page;
  const shot = async (n: string) => { if (process.env.SHOTS) await p.screenshot({ path: `/tmp/shots/${id}-${n}.png` }); };
  const zdecks = profileDecks().reverse();
  const z = await newWindow(
    { window: { x: 1920, y: 0 }, cursor: "arrow", gameSeed: 31, seed: { decks: zdecks, selectedDeckId: zdecks[0].id }, fake: { me: { ...ZORO, rating: 1655, wins: 70, losses: 50, rank: 9, games: 120 }, friends: [], leaderboard: board } },
    t.world,
    t.errors,
  );
  try {
    await Promise.all([t.goto("/"), z.win.page.goto("http://127.0.0.1:5274/")]);
    await p.locator(".friend-row").first().waitFor();
    await sleep(2000);
    // Off camera: both players queue for Ranked and the server pairs them.
    await p.getByRole("button", { name: /^Ranked/ }).first().click();
    await sleep(500);
    await z.win.page.getByRole("button", { name: /^Ranked/ }).first().click();
    const keep = p.getByRole("button", { name: "Keep opening hand" });
    await keep.waitFor({ timeout: 40_000 });
    await sleep(1800);
    await t.pointer.park(1180, 760);
    await shot("0");
    await t.rec.start();
    t.rec.markIn(0.2);
    await sleep(500);
    await t.pointer.click(keep, { ms: 850, settle: 90 });
    await z.win.page.getByRole("button", { name: "Keep opening hand" }).click();
    await p.locator(".board-root[data-phase=main]").waitFor({ timeout: 20_000 });
    await t.pointer.hover({ x: 1500, y: 700 }, { ms: 900 });
    await sleep(1100);
    await shot("1");
    // Then the ladder: your row, highlighted.
    t.rec.cut();
    await t.goto("/leaderboard");
    await p.locator(".bounty-row, .leaderboard-row, tr").first().waitFor();
    await sleep(1500);
    await t.pointer.park(1500, 700);
    await shot("2");
    t.rec.markIn(0.1);
    await sleep(300);
    await t.pointer.hover({ x: 1190, y: 424 }, { ms: 900 });
    await sleep(1100);
  } finally {
    await finishTake(t, [z.win]);
  }
}
