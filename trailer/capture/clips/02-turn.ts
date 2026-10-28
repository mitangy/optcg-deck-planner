/** 02-turn (8s): a real turn against the Bot. Play a Character, give DON!! to the Leader, drag the attack arrow. */
import { sleep } from "../lib/util";
import { finishTake, settle, startTake } from "../lib/take";
import { MIKO, WANO } from "../lib/data";
import { MIKO_STATS, friendsOfMiko } from "../lib/world";
import { endTurn, startBotGame, waitFor } from "../lib/game";

export const id = "02-turn";

export async function run(): Promise<void> {
  const t = await startTake({
    id,
    gameSeed: 11,
    seed: { settings: { handLayout: "fan" } },
    fake: { me: { ...MIKO, ...MIKO_STATS }, friends: friendsOfMiko() },
  });
  const p = t.page;
  const shot = async (n: string) => { if (process.env.SHOTS) await p.screenshot({ path: `/tmp/shots/${id}-${n}.png` }); };
  try {
    await t.goto("/");
    await sleep(2000);
    // Off camera: start the match and play through the opening turn.
    await startBotGame(p, { botDeck: "d-wano" });
    await p.getByRole("button", { name: "Keep opening hand" }).click();
    await waitFor(p, (s) => s.phase === "main" && s.turn === 1);
    await sleep(600);
    await endTurn(p);
    await waitFor(p, (s) => s.phase === "main" && s.turn === 3, 60_000);
    // Let the "Your turn" banner and the draw animation finish before the first recorded frame.
    await settle(3200);
    await t.pointer.park(1180, 760);
    await sleep(300);
    await shot("0");
    await t.rec.start();
    t.rec.markIn(0.2);
    await sleep(350);

    // The tucked fan rises when the pointer comes near it; hovering a card opens its preview.
    await t.pointer.hover({ x: 800, y: 1062 }, { ms: 650 });
    await sleep(380);
    const sanji = p.locator(".hand-fan-cards .card-tile", { hasText: "Sanji" }).first();
    await t.pointer.click(sanji, { ms: 380, settle: 60 });
    await sleep(700);
    await shot("1");
    await t.pointer.click(p.locator(".card-actions button", { hasText: /Play/ }).first(), { ms: 360, settle: 60 });
    await sleep(420);
    await shot("2");

    const myLeader = () => p.locator(".side-you .card-tile.attack-ready", { hasText: "Monkey.D.Luffy" }).first();
    await t.pointer.click(myLeader(), { ms: 700, settle: 60 });
    await sleep(350);
    await shot("3");
    await t.pointer.click(p.locator(".card-actions button", { hasText: /^\+1/ }).first(), { ms: 300, settle: 60 });
    await sleep(250);
    await shot("4");
    const foe = p.locator(".side-opp .card-tile", { hasText: "Kouzuki Oden" }).first();
    await t.pointer.drag(myLeader(), foe, { ms: 760, hold: 110 });
    await sleep(3000);
    await shot("6");
  } finally {
    await finishTake(t);
  }
}
