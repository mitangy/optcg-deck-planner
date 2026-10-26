/** 07-spectate (5s): a spectator opens /watch/<room> on a live match and watches a player act. */
import { sleep } from "../lib/util";
import { finishTake, newWindow, startTake } from "../lib/take";
import { MIKO, ZORO, NAMI } from "../lib/data";
import { MIKO_STATS, friendsOfMiko } from "../lib/world";
import { toSecondTurn } from "../lib/game";

export const id = "07-spectate";

export async function run(): Promise<void> {
  const t = await startTake({
    id,
    gameSeed: 11,
    fake: { me: { ...MIKO, ...MIKO_STATS }, friends: friendsOfMiko() },
  });
  const p = t.page;
  const shot = async (n: string) => { if (process.env.SHOTS) await p.screenshot({ path: `/tmp/shots/${id}-${n}.png` }); };
  // The match being watched: Zoro_main's browser, parked off screen, in a bot game of its own.
  const h = await newWindow(
    { window: { x: 1920, y: 0 }, cursor: "arrow", gameSeed: 11, seed: { settings: { handLayout: "fan" } }, fake: { me: { ...ZORO, rating: 1655, wins: 70, losses: 50, rank: 9, games: 120 }, friends: [] } },
    t.world,
    t.errors,
  );
  const hp = h.win.page;
  try {
    await hp.goto("http://127.0.0.1:5274/");
    await sleep(1500);
    await toSecondTurn(hp);
    await hp.getByRole("button", { name: "Match menu" }).click();
    const copy = await hp.getByRole("menuitem", { name: /Copy room ID/ }).innerText();
    await hp.keyboard.press("Escape");
    const room = /\(([^)]+)\)/.exec(copy)?.[1];
    if (!room) throw new Error(`no room id in "${copy}"`);

    await t.goto(`/watch/${room}`);
    await p.locator(".board-root").waitFor({ timeout: 30_000 });
    await sleep(3200);
    await t.pointer.park(1260, 760);
    await shot("0");
    await t.rec.start();
    t.rec.markIn(0.2);
    await sleep(700);
    // The watched player plays Sanji, off camera on his own window.
    await hp.locator(".hand-fan-cards .card-tile", { hasText: "Sanji" }).first().click({ force: true });
    await sleep(250);
    await hp.locator(".card-actions button", { hasText: /Play/ }).first().click({ force: true });
    await sleep(1500);
    await shot("1");
    await sleep(1800);
  } finally {
    await finishTake(t, [h.win]);
  }
}
