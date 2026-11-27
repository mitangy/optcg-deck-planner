import { sleep } from "../lib/util";
import { finishTake } from "../lib/take";
import { hypeTake, HYPE_SETTINGS } from "../lib/hype";
import { applySettings, toSecondTurn } from "../lib/game";

export const id = "hype-theming";
const THEMES = ["strawHat", "donquixote", "marines", "wano", "heart", "fishMan", "thrillerBark", "disco"];

/** Live board, settings flipped one at a time: the crew themes, light mode, hand layout, tilted board, big board. Marks say when each landed. */
export async function run(): Promise<void> {
  const t = await hypeTake(id, { seed: { settings: { ...HYPE_SETTINGS, theme: "nightSea", bigBoard: true } } });
  const p = t.page;
  const shot = async (n: string) => { if (process.env.SHOTS) await p.screenshot({ path: `/tmp/shots/${id}-${n}.png` }); };
  const step = async (name: string, patch: Record<string, unknown>, hold = 1100) => {
    await applySettings(p, patch);
    t.rec.mark(name, 0.06);
    await sleep(hold);
    await shot(name);
  };
  try {
    await t.goto("/");
    await sleep(2000);
    await toSecondTurn(p);
    await t.pointer.park(1000, 800);
    await sleep(300);
    await t.rec.start();
    t.rec.markIn(0.2);
    t.rec.mark("base");
    await sleep(900);
    for (const th of THEMES) await step(th, { theme: th });
    await step("nightSea", { theme: "nightSea" }, 700);
    await step("light", { colorMode: "light" }, 1300);
    await step("dark", { colorMode: "dark" }, 700);
    await step("grid", { handLayout: "grid" }, 1300);
    await step("fan", { handLayout: "fan" }, 1000);
    await step("tilted", { tiltedBoard: true }, 1500);
    await step("untilted", { tiltedBoard: false }, 700);
    await step("small", { bigBoard: false }, 1300);
    await step("big", { bigBoard: true }, 1500);
  } catch (e) {
    console.error(`[${id}]`, e);
    if (process.env.SHOTS) await p.screenshot({ path: `/tmp/shots/${id}-error.png` }).catch(() => undefined);
    throw e;
  } finally {
    await finishTake(t);
  }
}
