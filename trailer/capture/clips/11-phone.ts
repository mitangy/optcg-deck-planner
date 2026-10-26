/** 11-phone (4s): the same match on a 375x812 phone (device pixel ratio 2, touch layout). */
import { sleep } from "../lib/util";
import { finishTake, startTake } from "../lib/take";
import { MIKO } from "../lib/data";
import { MIKO_STATS, friendsOfMiko } from "../lib/world";
import { toSecondTurn } from "../lib/game";

export const id = "11-phone";
export const PHONE_DISPLAY = process.env.TRAILER_PHONE_DISPLAY ?? ":96";

export async function run(): Promise<void> {
  const t = await startTake({
    id,
    gameSeed: 11,
    cursor: "touch",
    window: { width: 375, height: 812, scale: 2, touch: true, display: PHONE_DISPLAY },
    area: { width: 750, height: 1624, display: PHONE_DISPLAY },
    fake: { me: { ...MIKO, ...MIKO_STATS }, friends: friendsOfMiko() },
  });
  const p = t.page;
  const shot = async (n: string) => { if (process.env.SHOTS) await p.screenshot({ path: `/tmp/shots/${id}-${n}.png` }); };
  try {
    await t.goto("/");
    await sleep(2500);
    await shot("lobby");
    await toSecondTurn(p);
    await t.pointer.park(560, 1400);
    await shot("0");
    await t.rec.start();
    t.rec.markIn(0.2);
    await sleep(400);
    const sanji = p.locator(".hand-row-inner .card-tile, .hand-fan-cards .card-tile", { hasText: "Sanji" }).first();
    await t.pointer.click(sanji, { ms: 520, settle: 60 });
    await sleep(500);
    await shot("1");
    await t.pointer.click(p.locator(".card-actions button", { hasText: /Play/ }).first(), { ms: 380, settle: 60 });
    await sleep(600);
    await shot("2");
    const leader = p.locator(".side-you .card-tile.attack-ready", { hasText: "Monkey" }).first();
    await t.pointer.click(leader, { ms: 520, settle: 60 });
    await sleep(450);
    await shot("3");
    await t.pointer.click(p.locator(".card-actions button", { hasText: /^\+1/ }).first(), { ms: 300, settle: 50 });
    await sleep(350);
    await t.pointer.click(leader, { ms: 250, settle: 50 });
    await sleep(350);
    await t.pointer.click(p.locator(".card-actions button", { hasText: /Attack/ }).first(), { ms: 300, settle: 50 });
    await sleep(500);
    await shot("4");
    await sleep(1500);
  } finally {
    await finishTake(t).catch((e) => console.log(String(e).slice(0, 100)));
  }
}
