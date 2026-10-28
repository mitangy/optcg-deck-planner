/**
 * 12-phone-portrait: a real practice game on a 375x812 phone (device pixel ratio 2, touch layout):
 * drag a card up from the fan to play it, tap a DON!! chip then the Leader to give it, drag the Leader
 * onto the opponent's to attack, end the turn, then answer the opponent's attack from the defend tray.
 */
import { sleep } from "../lib/util";
import { finishTake, startTake } from "../lib/take";
import { MIKO } from "../lib/data";
import { MIKO_STATS, friendsOfMiko } from "../lib/world";
import { toSecondTurn, waitFor } from "../lib/game";

export const id = "12-phone-portrait";
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
  const log = (m: string) => console.log(`[${id}] ${t.rec.now().toFixed(2)}s ${m}`);
  try {
    await t.goto("/");
    await sleep(2500);
    await toSecondTurn(p);
    // Park the pointer on the hand, then hide the touch ring: it fades in with the first move, and End turn shows no hover tip.
    await t.pointer.park(300, 700);
    await p.evaluate(() => document.getElementById("__trailer-cursor")?.classList.remove("on"));
    await sleep(400);
    await shot("0");
    await t.rec.start();
    t.rec.markIn(0.2);
    await sleep(350);
    const drag = async (from: { x: number; y: number }, to: { x: number; y: number }, ms = 450) => {
      await t.pointer.moveTo(from.x, from.y, { ms: 300 });
      await sleep(50);
      await p.mouse.down();
      await sleep(90);
      await t.pointer.moveTo(to.x, to.y, { ms, curve: 0.15 });
      await sleep(90);
      await p.mouse.up();
    };
    const ctr = async (loc: ReturnType<typeof p.locator>) => t.pointer.centerOf(loc);
    log("drag Sanji");
    const sanji = p.locator(".hand-row-inner .card-tile, .hand-fan-cards .card-tile", { hasText: "Sanji" }).first();
    const fb = (await p.locator(".side-you .zone-characters").first().boundingBox())!;
    await drag(await ctr(sanji), { x: fb.x + fb.width * 0.45, y: fb.y + fb.height * 0.5 });
    await shot("1");
    await sleep(450);
    log("give DON");
    const leader = p.locator(".side-you .zone-leader .card-tile").first();
    await drag(await ctr(p.locator('.side-you .don-chip-btn[data-don-rested="false"]').first()), await ctr(leader), 420);
    await sleep(350);
    await shot("4");
    log("attack");
    const oppLeader = p.locator(".side-opp .zone-leader .card-tile").first();
    await drag(await ctr(leader), await ctr(oppLeader), 450);
    await sleep(450);
    await shot("5a");
    t.rec.cut();
    await p.locator(".reveal-card").waitFor({ timeout: 15000 });
    await sleep(350);
    t.rec.markIn();
    log("reveal");
    await sleep(420);
    await shot("5");
    await t.pointer.click(p.locator(".reveal-card"), { ms: 280, settle: 30 });
    await p.locator(".reveal-card").waitFor({ state: "detached" });
    await sleep(250);
    log("end turn");
    await t.pointer.click(p.locator(".intent-btn-primary", { hasText: /End turn/ }), { ms: 380, settle: 30 });
    await sleep(450);
    t.rec.cut();
    await waitFor(p, (s) => s.phase === "block", 20000);
    await sleep(500);
    t.rec.markIn();
    log("block step");
    await shot("7");
    await sleep(300);
    await t.pointer.click(p.locator(".intent-btn-primary").first(), { ms: 380, settle: 30 });
    await sleep(200);
    t.rec.cut();
    await waitFor(p, (s) => s.phase === "counter", 20000);
    await sleep(500);
    t.rec.markIn();
    log("counter step");
    await shot("8");
    await sleep(200);
    const chip = p.locator(".defend-chips .defend-chip").first();
    await t.pointer.click(chip, { ms: 380, settle: 30 });
    if ((await chip.getAttribute("aria-pressed").catch(() => null)) !== "true") {
      log("chip tap missed, retrying");
      await t.pointer.click(chip, { ms: 200, settle: 30 });
    }
    await p.locator('.defend-chips .defend-chip[aria-pressed="true"]').first().waitFor({ timeout: 4000 });
    await sleep(400);
    await shot("9");
    await t.pointer.click(p.locator(".intent-btn-primary").first(), { ms: 300, settle: 30 });
    await sleep(800);
    await shot("10");
    log("done");
  } finally {
    await finishTake(t).catch((e) => console.log(String(e).slice(0, 100)));
  }
}
