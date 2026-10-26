/** 06-friends (10s): friends list with presence dots; Miko invites Zoro_main, he joins from his own browser, both land in the room. */
import { sleep } from "../lib/util";
import { finishTake, newWindow, startTake } from "../lib/take";
import { MIKO, ZORO, WORST_GENERATION } from "../lib/data";
import { MIKO_STATS, friendsOfMiko, friendsOfZoro } from "../lib/world";
import { World } from "../lib/fakeApi";
import { profileDecks } from "../lib/data";

export const id = "06-friends";

export async function run(): Promise<void> {
  const world = new World();
  const t = await startTake({
    id,
    gameSeed: 23,
    fake: { me: { ...MIKO, ...MIKO_STATS }, friends: friendsOfMiko(), world },
  });
  const p = t.page;
  const shot = async (n: string) => { if (process.env.SHOTS) await p.screenshot({ path: `/tmp/shots/${id}-${n}.png` }); };
  // Zoro's browser is a second real window parked just off the right edge of the screen: not recorded, fully live.
  const zdecks = profileDecks().reverse();
  const z = await newWindow(
    { window: { x: 1920, y: 0 }, cursor: "arrow", fake: { me: { ...ZORO, rating: 1655, wins: 70, losses: 50, rank: 9, games: 120 }, friends: friendsOfZoro(), world }, seed: { decks: zdecks, selectedDeckId: zdecks[0].id }, gameSeed: 23 },
    world,
    t.errors,
  );
  world.onInvite = () => {
    void z.win.page.evaluate(() => document.dispatchEvent(new Event("visibilitychange"))).catch(() => undefined);
  };
  try {
    await Promise.all([t.goto("/"), z.win.page.goto("http://127.0.0.1:5274/")]);
    await p.locator(".friend-row").first().waitFor();
    await sleep(2500);
    await t.pointer.park(1500, 850);
    await shot("0");
    await t.rec.start();
    t.rec.markIn(0.2);
    await sleep(1300);
    const zoro = p.locator(".friend-row", { hasText: "Zoro_main" });
    await t.pointer.hover(zoro, { ms: 800 });
    await sleep(500);
    await shot("1");
    await t.pointer.click(zoro.getByRole("button", { name: "Invite" }), { ms: 600, settle: 100 });
    await sleep(600);
    await shot("2");
    // Zoro's side, off screen: his invite card appears, he joins.
    const join = z.win.page.locator('[aria-label="Game invite"]').getByRole("button", { name: "Join" });
    await join.waitFor({ timeout: 15_000 });
    await sleep(350);
    await join.click();
    await p.getByRole("button", { name: "Keep opening hand" }).waitFor({ timeout: 30_000 });
    await sleep(2400);
    await shot("3");
  } finally {
    await finishTake(t, [z.win]);
  }
}
