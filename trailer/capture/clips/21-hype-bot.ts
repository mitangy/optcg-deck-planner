import { sleep } from "../lib/util";
import { finishTake } from "../lib/take";
import { hypeTake } from "../lib/hype";
import { profileDecks } from "../lib/data";
import { endTurn, phase, waitFor } from "../lib/game";

export const id = "hype-bot";

/** Play vs Bot on Hard: the setup dialog (level, the meta Leaders the bot knows), then the bot's turn: it attacks and picks targets. */
export async function run(): Promise<void> {
  const t = await hypeTake(id);
  const p = t.page;
  const shot = async (n: string) => { if (process.env.SHOTS) await p.screenshot({ path: `/tmp/shots/${id}-${n}.png` }); };
  const bot = process.env.HYPE_BOT_DECK ?? "Wano Samurai";
  try {
    await t.goto("/");
    await sleep(2200);
    await t.pointer.park(900, 560);
    await t.rec.start();
    t.rec.markIn(0.2);
    await sleep(300);

    // 1. Setup dialog.
    await t.pointer.click(p.getByRole("button", { name: /^Play vs Bot/ }).first(), { ms: 650, settle: 80 });
    await p.getByRole("dialog").waitFor();
    await sleep(500);
    t.rec.mark("dialog");
    await t.pointer.click(p.getByRole("radio", { name: "Hard" }), { ms: 520, settle: 80 });
    await sleep(650);
    await shot("hard");
    t.rec.mark("hard");
    await t.pointer.click(p.getByLabel("Bot's deck"), { ms: 520, settle: 80 });
    await sleep(900);
    t.rec.mark("metaList");
    await shot("list");
    const deck = profileDecks().find((d) => d.name === bot);
    const opt = p.getByRole("option", { name: new RegExp(`^${deck?.name ?? bot} \\(`) });
    await t.pointer.moveTo(900, 330, { ms: 400 });
    await sleep(250);
    await opt.scrollIntoViewIfNeeded();
    await t.pointer.click(opt, { ms: 450, settle: 80 });
    await sleep(500);
    await t.pointer.click(p.getByRole("button", { name: "Start game" }), { ms: 480, settle: 80 });
    await p.getByRole("button", { name: "Keep opening hand" }).waitFor({ timeout: 30_000 });
    await sleep(900);
    t.rec.cut();

    // 2. Play through to my second turn off the record.
    await p.getByRole("button", { name: "Keep opening hand" }).click();
    await waitFor(p, (s) => s.phase === "main" && s.turn === 1);
    await sleep(600);
    await endTurn(p);
    await waitFor(p, (s) => s.phase === "main" && s.turn === 3, 90_000);
    await sleep(3200);
    await t.pointer.park(900, 640);
    t.rec.markIn(0.1);
    await sleep(500);
    // 3. Play a card, end the turn, and the bot attacks.
    await t.pointer.hover({ x: 700, y: 1066 }, { ms: 500 });
    await sleep(300);
    const sanji = p.locator(".hand-fan-cards .card-tile", { hasText: "Sanji" }).first();
    const field = (await p.locator(".side-you .zone-characters").first().boundingBox())!;
    await t.pointer.drag(sanji, { x: field.x + field.width * 0.4, y: field.y + field.height * 0.5 }, { ms: 560, hold: 90 });
    await sleep(500);
    await t.pointer.click(p.locator(".intent-btn-primary", { hasText: /End turn/ }), { ms: 480, settle: 60 });
    await sleep(350);
    const again = p.locator(".intent-btn-primary", { hasText: /(Tap|Click) again|End turn\?/ });
    if (await again.isVisible().catch(() => false)) await t.pointer.click(again, { ms: 200, settle: 40 });
    t.rec.cut();
    await waitFor(p, (s) => s.phase === "block" || s.phase === "counter", 90_000);
    await sleep(300);
    t.rec.markIn(0);
    t.rec.mark("botAttack");
    await shot("attack");
    await sleep(2600);
    await shot("attack2");
    t.rec.mark("attackEnd");
    t.rec.cut();

    // 4. The bot wins: I only pass (no blocks, no counters) until it finds lethal. Each bot turn is recorded from its start;
    // a turn that does not end the game is dropped, so the clip ends with the last attack and the "Match over" result.
    let over = false;
    let ended = -1;
    let lastLog = 0;
    t.rec.markIn(0);
    const t0 = Date.now();
    while (!over) {
      if (Date.now() - t0 > 300_000) throw new Error("the bot never won in time");
      if (await p.locator(".match-result-kicker").isVisible().catch(() => false)) { over = true; break; }
      const s = await phase(p);
      if (process.env.SHOTS && Date.now() - lastLog > 6000) { lastLog = Date.now(); console.log(`[${id}] state`, JSON.stringify(s)); await shot(`loop-${Math.floor((Date.now() - t0) / 1000)}`); }
      const noTrig = p.getByRole("button", { name: "No Trigger" });
      if (await noTrig.isVisible().catch(() => false)) { await sleep(700); await noTrig.click().catch(() => undefined); }
      else if (s.phase === "block" || s.phase === "counter") {
        await sleep(1100);
        const pass = p.getByRole("button", { name: /^Pass/ }).first();
        if (await pass.isVisible().catch(() => false)) await pass.click().catch(() => undefined);
      } else if (s.phase === "main" && s.turn % 2 === 1 && s.turn !== ended) {
        ended = s.turn;
        await shot(`turn-${s.turn}`);
        await sleep(500);
        t.rec.markIn(0);
        await endTurn(p);
      }
      await sleep(250);
    }
    await sleep(1600);
    t.rec.mark("lethal", -1.6);
    await shot("over");
    await sleep(2800);
    t.rec.mark("over");
    if (!over) throw new Error("the bot never won");
  } catch (e) {
    console.error(`[${id}]`, e);
    if (process.env.SHOTS) await p.screenshot({ path: `/tmp/shots/${id}-error.png` }).catch(() => undefined);
    throw e;
  } finally {
    await finishTake(t);
  }
}
