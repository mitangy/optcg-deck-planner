/** 05-layout (6s): make the board yours: drag a side panel across, move the fanned hand, tilt the board. */
import { sleep } from "../lib/util";
import { finishTake, startTake } from "../lib/take";
import { MIKO } from "../lib/data";
import { MIKO_STATS, friendsOfMiko } from "../lib/world";
import { toSecondTurn } from "../lib/game";

export const id = "05-layout";

export async function run(): Promise<void> {
  const t = await startTake({
    id,
    gameSeed: 11,
    seed: { settings: { handLayout: "fan", keepHandOpen: true, sideColumns: "both", previewPopup: false } },
    fake: { me: { ...MIKO, ...MIKO_STATS }, friends: friendsOfMiko() },
  });
  const p = t.page;
  const shot = async (n: string) => { if (process.env.SHOTS) await p.screenshot({ path: `/tmp/shots/${id}-${n}.png` }); };
  try {
    await t.goto("/");
    await sleep(2000);
    await toSecondTurn(p);
    await t.pointer.park(1000, 700);
    await shot("0");
    await t.rec.start();
    t.rec.markIn(0.2);
    await sleep(400);
    // 1. a side panel across to the other column
    const log = p.locator('[data-panel="log"]');
    await t.pointer.hover(log, { ms: 420 });
    await sleep(120);
    const grip = p.locator('[data-panel="log"] > .panel-grip');
    await t.pointer.drag(grip, { x: 1750, y: 640 }, { ms: 650, hold: 90 });
    await sleep(350);
    await shot("1");
    // 2. the fanned hand somewhere else
    const fan = p.locator(".hand-fan-grip");
    await t.pointer.hover({ x: 900, y: 900 }, { ms: 380 });
    await sleep(120);
    await t.pointer.drag(fan, { x: 720, y: 1074 }, { ms: 600, hold: 90 });
    await sleep(350);
    await shot("2");
    // 3. tilt the board
    await t.pointer.click(p.getByRole("button", { name: "Match menu" }), { ms: 520, settle: 40 });
    await sleep(150);
    await t.pointer.click(p.getByRole("menuitem", { name: "Gameplay settings" }), { ms: 300, settle: 40 });
    await sleep(500);
    await t.pointer.click(p.locator("label", { hasText: "Tilted board" }).first(), { ms: 520, settle: 40 });
    await sleep(350);
    await shot("3");
    await p.keyboard.press("Escape");
    await sleep(1500);
    await shot("4");
  } finally {
    await finishTake(t);
  }
}
