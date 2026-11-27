import { join } from "node:path";
import { easeScrollTo, layoutSettled, sleep } from "../lib/util";
import { toSecondTurn } from "../lib/game";
import { ASSET_DIR } from "../lib/env";
import { finishTake } from "../lib/take";
import { hypeTake } from "../lib/hype";
import type { Page } from "playwright";

export const id = "hype-art-board";

export async function run(): Promise<void> {
  const t = await hypeTake(id, { seed: { settings: { handLayout: "fan", previewPopup: false, playmatDim: 0 } } });
  const p = t.page;
  const upload = async (section: string, file: string) => {
    const label = p.locator(`${section} label.btn`, { hasText: /Upload image|Replace image/ }).first();
    const chooser = p.waitForEvent("filechooser");
    await label.click();
    await (await chooser).setFiles(join(ASSET_DIR, file));
    const apply = p.getByRole("button", { name: "Apply", exact: true });
    await apply.waitFor({ timeout: 8000 });
    await sleep(300);
    await apply.click();
    await p.getByText(/Processing/).first().waitFor({ state: "detached", timeout: 15_000 }).catch(() => {});
    await layoutSettled(p);
  };
  try {
    // Off the record: set the art, then show the board wearing it.
    await t.goto("/settings");
    await p.locator("#playmat").waitFor();
    await sleep(1200);
    await upload("#playmat", "playmat.png");
    await easeScrollTo(p, "#card-back", { ms: 300 });
    await upload("#card-back", "cardback.png");
    await t.goto("/");
    await sleep(1800);
    await toSecondTurn(p);
    await t.pointer.park(1000, 800);
    await sleep(400);
    await t.rec.start();
    t.rec.markIn(0.2);
    await sleep(500);
    await t.pointer.hover({ x: 700, y: 1066 }, { ms: 700 });
    await sleep(1600);
    await t.pointer.moveTo(1000, 850, { ms: 700 });
    await sleep(900);
  } catch (e) {
    console.error(`[${id}]`, e);
    if (process.env.SHOTS) await p.screenshot({ path: `/tmp/shots/${id}-error.png` }).catch(() => undefined);
    throw e;
  } finally {
    await finishTake(t);
  }
}
