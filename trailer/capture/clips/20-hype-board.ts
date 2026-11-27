import { sleep } from "../lib/util";
import { finishTake, settle } from "../lib/take";
import { hypeTake } from "../lib/hype";
import { toSecondTurn } from "../lib/game";

export const id = "hype-board";

/** A turn on the board: drag a card from the hand to play it, give DON!!, drag the Leader onto a target (attack arrow). */
export async function run(): Promise<void> {
  const t = await hypeTake(id);
  const p = t.page;
  const shot = async (n: string) => { if (process.env.SHOTS) await p.screenshot({ path: `/tmp/shots/${id}-${n}.png` }); };
  try {
    await t.goto("/");
    await sleep(2000);
    await toSecondTurn(p);
    await settle(400);
    await t.pointer.park(900, 640);
    await sleep(300);
    await shot("0");
    await t.rec.start();
    t.rec.markIn(0.2);
    await sleep(350);

    await t.pointer.hover({ x: 700, y: 1066 }, { ms: 600 });
    await sleep(380);
    await shot("1");
    const sanji = p.locator(".hand-fan-cards .card-tile", { hasText: "Sanji" }).first();
    const field = (await p.locator(".side-you .zone-characters").first().boundingBox())!;
    t.rec.mark("playDrag");
    await t.pointer.drag(sanji, { x: field.x + field.width * 0.4, y: field.y + field.height * 0.5 }, { ms: 620, hold: 100 });
    await sleep(700);
    await shot("2");

    const myLeader = () => p.locator(".side-you .card-tile.attack-ready", { hasText: "Monkey.D.Luffy" }).first();
    const donChip = p.locator('.side-you .don-chip-btn[data-don-rested="false"]').first();
    if (await donChip.isVisible().catch(() => false)) {
      await t.pointer.drag(donChip, myLeader(), { ms: 520, hold: 90 });
      await sleep(500);
      await shot("3");
    }
    const foe = p.locator(".side-opp .card-tile", { hasText: "Kouzuki Oden" }).first();
    t.rec.mark("attackDrag");
    await t.pointer.drag(myLeader(), foe, { ms: 760, hold: 260 });
    t.rec.mark("attackDone");
    await sleep(2600);
    await shot("4");
  } catch (e) {
    console.error(`[${id}]`, e);
    if (process.env.SHOTS) await p.screenshot({ path: `/tmp/shots/${id}-error.png` }).catch(() => undefined);
    throw e;
  } finally {
    await finishTake(t);
  }
}
