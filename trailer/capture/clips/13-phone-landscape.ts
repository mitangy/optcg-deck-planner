/**
 * 13-phone-landscape: the same game on a phone turned sideways (812x375 CSS px, device pixel ratio 2,
 * 1624x750 px): play a card, give DON!!, attack.
 */
import { sleep } from "../lib/util";
import { finishTake, startTake } from "../lib/take";
import { MIKO } from "../lib/data";
import { MIKO_STATS, friendsOfMiko } from "../lib/world";
import { toSecondTurn } from "../lib/game";

export const id = "13-phone-landscape";
export const PHONE_LAND_DISPLAY = process.env.TRAILER_PHONE_LAND_DISPLAY ?? ":95";

export async function run(): Promise<void> {
  const t = await startTake({
    id,
    gameSeed: 11,
    cursor: "touch",
    window: { width: 812, height: 375, scale: 2, touch: true, display: PHONE_LAND_DISPLAY },
    area: { width: 1624, height: 750, display: PHONE_LAND_DISPLAY },
    fake: { me: { ...MIKO, ...MIKO_STATS }, friends: friendsOfMiko() },
  });
  const p = t.page;
  const shot = async (n: string) => { if (process.env.SHOTS) await p.screenshot({ path: `/tmp/shots/${id}-${n}.png` }); };
  const log = (m: string) => console.log(`[${id}] ${t.rec.now().toFixed(2)}s ${m}`);
  try {
    await t.goto("/");
    await sleep(2500);
    await toSecondTurn(p);
    await t.pointer.park(400, 250);
    await p.evaluate(() => document.getElementById("__trailer-cursor")?.classList.remove("on"));
    await sleep(400);
    await shot("0");
    await t.rec.start();
    t.rec.markIn(0.2);
    await sleep(300);
    const drag = async (from: { x: number; y: number }, to: { x: number; y: number }, ms = 380) => {
      await t.pointer.moveTo(from.x, from.y, { ms: 230 });
      await sleep(50);
      await p.mouse.down();
      await sleep(90);
      await t.pointer.moveTo(to.x, to.y, { ms, curve: 0.15 });
      await sleep(90);
      await p.mouse.up();
    };
    const ctr = async (loc: ReturnType<typeof p.locator>) => t.pointer.centerOf(loc);
    log("drag Carrot");
    const sanji = p.locator(".rail-hand-cards .card-tile", { hasText: "Carrot" }).first();
    const fb = (await p.locator(".side-you .zone-characters").first().boundingBox())!;
    await drag(await ctr(sanji), { x: fb.x + fb.width * 0.45, y: fb.y + fb.height * 0.5 });
    await sleep(250);
    await shot("1");
    log("give DON");
    const leader = p.locator(".side-you .zone-leader .card-tile").first();
    await drag(await ctr(p.locator('.side-you .don-chip-btn[data-don-rested="false"]').first()), await ctr(leader), 360);
    await sleep(150);
    await shot("2");
    log("attack");
    const oppLeader = p.locator(".side-opp .zone-leader .card-tile").first();
    await drag(await ctr(leader), await ctr(oppLeader), 400);
    await sleep(500);
    await shot("3");
    log("done");
  } finally {
    await finishTake(t).catch((e) => console.log(String(e).slice(0, 100)));
  }
}
