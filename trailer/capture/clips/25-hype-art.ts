import { join } from "node:path";
import { easeScrollTo, layoutSettled, sleep } from "../lib/util";
import { BACKS_DIR, PLAYER_MATS, PLAYMAT_FILE } from "../lib/env";
import { existsSync } from "node:fs";
import { finishTake } from "../lib/take";
import { hypeTake } from "../lib/hype";
import type { Page } from "playwright";

export const id = "hype-art";

export async function run(): Promise<void> {
  const t = await hypeTake(id, {
    window: { width: 900, height: 1040 }, seed: { settings: { handLayout: "fan", previewPopup: false, playmatDim: 0 } } });
  const p = t.page;
  const shot = async (n: string) => { if (process.env.SHOTS) await p.screenshot({ path: `/tmp/shots/${id}-${n}.png` }); };
  const upload = async (section: string, path: string, tag = "") => {
    const file = path.split("/").pop() ?? path;
    const label = p.locator(`${section} label.btn`, { hasText: /Upload image|Replace image/ }).first();
    const chooser = p.waitForEvent("filechooser");
    await t.pointer.click(label, { ms: 700, settle: 80 });
    await (await chooser).setFiles(path);
    const apply = p.getByRole("button", { name: "Apply", exact: true });
    await apply.waitFor({ timeout: 8000 });
    if (tag) t.rec.mark(`${tag}Editor`);
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
  if (!existsSync(PLAYMAT_FILE)) throw new Error(`missing ${PLAYMAT_FILE} (Miko's playmat lives outside the repo; set HYPE_ASSETS)`);
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
    await upload("#playmat", PLAYMAT_FILE, "playmat");
    t.rec.mark("playmatDone");
    await shot("1");
    // Then a quick run through other players' real mats.
    for (const [i, mat] of PLAYER_MATS.filter((f) => existsSync(f)).entries()) {
      t.rec.mark(`mat${i}Open`);
      await upload("#playmat", mat, `mat${i}`);
      t.rec.mark(`mat${i}Done`);
      await shot(`mat-${i}`);
    }
    await easeScrollTo(p, "#card-back", { ms: 850 });
    await sleep(300);
    t.rec.mark("backStart");
    // A quick cycle of the themed backs; the first one (Straw Hat) is the one the board clip wears.
    for (const [i, name] of ["straw-hat", "pirate-hunter", "surgeon-of-death", "navy"].entries()) {
      t.rec.mark(`back${i}Open`);
      await upload("#card-back", join(BACKS_DIR, `${name}.png`), `back${i}`);
      t.rec.mark(`back${i}Done`);
      await shot(`back-${name}`);
      await sleep(500);
    }
    t.rec.mark("backDone");
    t.rec.mark("end");
  } catch (e) {
    console.error(`[${id}]`, e);
    if (process.env.SHOTS) await p.screenshot({ path: `/tmp/shots/${id}-error.png` }).catch(() => undefined);
    throw e;
  } finally {
    await finishTake(t);
  }
}
