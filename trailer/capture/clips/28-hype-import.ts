import { sleep } from "../lib/util";
import { finishTake } from "../lib/take";
import { hypeTake } from "../lib/hype";

export const id = "hype-import";

/** Settings > Log Pose: "Import OPTCGSim games" (choose the export file, or paste one combat log). */
export async function run(): Promise<void> {
  const t = await hypeTake(id, { window: { width: 900, height: 1040 }, fake: { logPose: true } });
  const p = t.page;
  const shot = async (n: string) => { if (process.env.SHOTS) await p.screenshot({ path: `/tmp/shots/${id}-${n}.png` }); };
  try {
    await t.goto("/settings");
    await p.getByText("Import OPTCGSim games").first().waitFor({ timeout: 30_000 });
    await sleep(1200);
    const head = p.locator("#sim-import-title").first();
    await head.evaluate((el) => el.scrollIntoView({ block: "start" }));
    await sleep(500);
    await t.pointer.park(700, 900);
    await shot("0");
    await t.rec.start();
    t.rec.markIn(0.2);
    await sleep(600);
    // Hover the file button (a click would open the OS file picker) and then focus the paste box.
    await t.pointer.hover(p.getByText("Choose export file").first(), { ms: 900 });
    await sleep(900);
    await t.pointer.click(p.getByPlaceholder("Or paste one combat log here"), { ms: 700, settle: 80 });
    await sleep(900);
    await shot("1");
    await t.pointer.moveTo(450, 640, { ms: 700 });
    await sleep(1200);
  } catch (e) {
    console.error(`[${id}]`, e);
    if (process.env.SHOTS) await p.screenshot({ path: `/tmp/shots/${id}-error.png` }).catch(() => undefined);
    throw e;
  } finally {
    await finishTake(t);
  }
}
