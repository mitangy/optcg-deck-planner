import { sleep } from "../lib/util";
import { finishTake } from "../lib/take";
import { hypeTake, HYPE_SETTINGS } from "../lib/hype";

export const id = "hype-phone";
export const PHONE_DISPLAY = process.env.TRAILER_PHONE_DISPLAY ?? ":96";

/** A phone, portrait: the page loads from a link, you land on home, tap Play vs Bot, and you are on the board. */
export async function run(): Promise<void> {
  const t = await hypeTake(id, {
    seed: { settings: { ...HYPE_SETTINGS, handLayout: "auto" } },
    window: { width: 375, height: 812, scale: 2, touch: true, display: PHONE_DISPLAY },
    area: { width: 750, height: 1624, display: PHONE_DISPLAY },
  });
  const p = t.page;
  const shot = async (n: string) => { if (process.env.SHOTS) await p.screenshot({ path: `/tmp/shots/${id}-${n}.png` }); };
  try {
    await t.goto("/"); // warm the dev server so the recorded load is quick
    await p.getByRole("button", { name: /^Play vs Bot/ }).first().waitFor({ timeout: 40_000 });
    await sleep(800);
    await p.goto("about:blank");
    await t.pointer.park(300, 700);
    await p.evaluate(() => document.getElementById("__trailer-cursor")?.classList.remove("on")).catch(() => undefined);
    await t.rec.start();
    t.rec.markIn(0.1);
    t.rec.mark("load");
    await t.goto("/");
    await p.getByRole("button", { name: /^Play vs Bot/ }).first().waitFor({ timeout: 20_000 });
    await sleep(1600);
    await shot("home");
    t.rec.mark("home");
    await t.pointer.click(p.getByRole("button", { name: /^Play vs Bot/ }).first(), { ms: 450, settle: 60 });
    await p.getByRole("dialog").waitFor();
    await sleep(900);
    await shot("dialog");
    t.rec.mark("dialog");
    await t.pointer.click(p.getByRole("radio", { name: "Hard" }), { ms: 380, settle: 60 });
    await sleep(350);
    await t.pointer.click(p.getByLabel("Bot's deck"), { ms: 380, settle: 60 });
    await sleep(500);
    const opt = p.getByRole("option", { name: /^Wano Samurai \(/ });
    await opt.scrollIntoViewIfNeeded();
    await t.pointer.click(opt, { ms: 380, settle: 60 });
    await sleep(500);
    await t.pointer.click(p.getByRole("button", { name: "Start game" }), { ms: 420, settle: 60 });
    await p.getByRole("button", { name: "Keep opening hand" }).waitFor({ timeout: 30_000 });
    await sleep(1100);
    await shot("mulligan");
    t.rec.mark("mulligan");
    await t.pointer.click(p.getByRole("button", { name: "Keep opening hand" }), { ms: 380, settle: 60 });
    await sleep(3200);
    await shot("board");
    t.rec.mark("board");
    await sleep(600);
  } catch (e) {
    console.error(`[${id}]`, e);
    if (process.env.SHOTS) await p.screenshot({ path: `/tmp/shots/${id}-error.png` }).catch(() => undefined);
    throw e;
  } finally {
    await finishTake(t).catch((e) => console.log(String(e).slice(0, 100)));
  }
}
