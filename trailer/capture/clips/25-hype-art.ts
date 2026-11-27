import { join } from "node:path";
import { easeScrollTo, layoutSettled, sleep } from "../lib/util";
import { ASSET_DIR } from "../lib/env";
import { finishTake } from "../lib/take";
import { hypeTake } from "../lib/hype";
import type { Page } from "playwright";

export const id = "hype-art";

export async function run(): Promise<void> {
  const t = await hypeTake(id, {
    window: { width: 900, height: 1040 }, seed: { settings: { handLayout: "fan", previewPopup: false, playmatDim: 0 } } });
  const p = t.page;
  const shot = async (n: string) => { if (process.env.SHOTS) await p.screenshot({ path: `/tmp/shots/${id}-${n}.png` }); };
  const upload = async (section: string, file: string) => {
    const label = p.locator(`${section} label.btn`, { hasText: /Upload image|Replace image/ }).first();
    const chooser = p.waitForEvent("filechooser");
    await t.pointer.click(label, { ms: 700, settle: 80 });
    await (await chooser).setFiles(join(ASSET_DIR, file));
    const apply = p.getByRole("button", { name: "Apply", exact: true });
    await apply.waitFor({ timeout: 8000 });
    await sleep(450);
    await shot(`editor-${file.replace(/\W/g, "")}`);
    await t.pointer.click(apply, { ms: 600, settle: 60 });
    await sleep(550);
    // The crop closes and "Processing…" resolves; wait out the reflow, then ease back to the section instead of letting the page jump.
    await p.getByText(/Processing/).first().waitFor({ state: "detached", timeout: 15_000 }).catch(() => {});
    await layoutSettled(p);
    await easeScrollTo(p, section, { ms: 700 });
    await sleep(250);
  };
  try {
    await t.goto("/settings");
    await p.locator("#playmat").waitFor();
    await sleep(1500);
    await easeScrollTo(p, "#playmat", { ms: 700 });
    await sleep(600);
    await t.pointer.park(1100, 300);
    await shot("0");
    await t.rec.start();
    t.rec.markIn(0.2);
    await sleep(400);
    t.rec.mark("playmatStart");
    await upload("#playmat", "playmat.png");
    t.rec.mark("playmatDone");
    await shot("1");
    await easeScrollTo(p, "#card-back", { ms: 850 });
    await sleep(300);
    t.rec.mark("backStart");
    await upload("#card-back", "cardback.png");
    t.rec.mark("backDone");
    await shot("2");
    t.rec.mark("end");
  } catch (e) {
    console.error(`[${id}]`, e);
    if (process.env.SHOTS) await p.screenshot({ path: `/tmp/shots/${id}-error.png` }).catch(() => undefined);
    throw e;
  } finally {
    await finishTake(t);
  }
}
