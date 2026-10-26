/** 03-themes (10s): the nine crew themes on a live board, one a second, then light mode. */
import { sleep } from "../lib/util";
import { finishTake, startTake } from "../lib/take";
import { MIKO } from "../lib/data";
import { MIKO_STATS, friendsOfMiko } from "../lib/world";
import { applySettings, toSecondTurn } from "../lib/game";

export const id = "03-themes";
const ORDER = ["nightSea", "strawHat", "donquixote", "marines", "wano", "heart", "fishMan", "thrillerBark", "disco"];

export async function run(): Promise<void> {
  const t = await startTake({
    id,
    gameSeed: 11,
    seed: { settings: { handLayout: "fan", theme: "nightSea" } },
    fake: { me: { ...MIKO, ...MIKO_STATS }, friends: friendsOfMiko() },
  });
  const p = t.page;
  try {
    await t.goto("/");
    await sleep(2000);
    await toSecondTurn(p);
    await t.pointer.park(1180, 700);
    await t.rec.start();
    t.rec.markIn(0.2);
    await sleep(300);
    // A slow drift so the cursor shows it is a live page, while the theme changes under it.
    void t.pointer.moveTo(1000, 470, { ms: 9000, curve: 0.6 });
    for (let i = 1; i < ORDER.length; i++) {
      await sleep(i === 1 ? 750 : 1000);
      await applySettings(p, { theme: ORDER[i] });
    }
    await sleep(1000);
    await applySettings(p, { theme: "nightSea", colorMode: "light" });
    await sleep(1500);
  } finally {
    await finishTake(t);
  }
}
