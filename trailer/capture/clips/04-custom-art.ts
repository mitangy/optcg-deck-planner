/** 04-custom-art (8s): Settings > Appearance: playmat and card back uploads, a DON!! card, then the board wearing them. */
import { join } from "node:path";
import { easeScrollTo, layoutSettled, sleep } from "../lib/util";
import { ASSET_DIR } from "../lib/env";
import { finishTake, startTake } from "../lib/take";
import { MIKO } from "../lib/data";
import { MIKO_STATS, friendsOfMiko } from "../lib/world";
import { toSecondTurn } from "../lib/game";
import type { Page } from "playwright";

export const id = "04-custom-art";

export async function run(): Promise<void> {
  const t = await startTake({
    id,
    gameSeed: 11,
    seed: { settings: { handLayout: "fan", playmatDim: 0 } },
    fake: { me: { ...MIKO, ...MIKO_STATS }, friends: friendsOfMiko() },
  });
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
    await t.pointer.park(1200, 300);
    await shot("0");
    await t.rec.start();
    t.rec.markIn(0.2);
    await sleep(400);
    await upload("#playmat", "playmat.png");
    await shot("1");
    await easeScrollTo(p, "#card-back", { ms: 850 });
    await sleep(300);
    await upload("#card-back", "cardback.png");
    await shot("2");
    // DON!! art: the next panel down, pick the gold Luffy printing.
    await easeScrollTo(p, "#don-card", { ms: 850 });
    await sleep(300);
    const tile = p.locator("#don-card .don-art-tile", { hasText: "Gold" }).first();
    await t.pointer.click(tile, { ms: 800, settle: 60 });
    await sleep(900);
    await shot("3");
    // Off camera: into a match so the board can show all three.
    t.rec.cut();
    await t.goto("/");
    await sleep(1500);
    await toSecondTurn(p);
    await t.pointer.park(1100, 640);
    await shot("4");
    t.rec.markIn(0.1);
    await sleep(500);
    await t.pointer.hover({ x: 1010, y: 760 }, { ms: 900 });
    await sleep(1700);
  } finally {
    await finishTake(t);
  }
}
