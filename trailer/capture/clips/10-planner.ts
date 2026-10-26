/** 10-planner (5s): the deck planner with market prices (and the last sales behind one), then Play in Duel. */
import { sleep } from "../lib/util";
import { PLANNER_ORIGIN } from "../lib/env";
import { finishTake, startTake } from "../lib/take";
import { MIKO, STRAW_HATS } from "../lib/data";
import { MIKO_STATS, friendsOfMiko } from "../lib/world";
import { cors } from "../lib/fakeApi";
import { plannerDeck, plannerExtra } from "../lib/plannerApi";

export const id = "10-planner";

export async function run(): Promise<void> {
  const deck = plannerDeck(1, "Straw Hat Crew", STRAW_HATS);
  const t = await startTake({
    id,
    fake: { me: { ...MIKO, ...MIKO_STATS }, friends: friendsOfMiko(), extra: plannerExtra(MIKO, deck, cors) },
  });
  const p = t.page;
  const shot = async (n: string) => { if (process.env.SHOTS) await p.screenshot({ path: `/tmp/shots/${id}-${n}.png` }); };
  try {
    await p.goto(`${PLANNER_ORIGIN}/decks/1`);
    await p.locator("[data-card-id]:visible").first().waitFor({ timeout: 20_000 });
    // Only the images in view load (the rest are lazy): wait for those.
    await p.waitForFunction(
      () => [...document.images].filter((i) => { const r = i.getBoundingClientRect(); return r.bottom > 0 && r.top < innerHeight && r.width > 0; }).every((i) => i.complete && i.naturalWidth > 0),
      null, { timeout: 30_000 },
    );
    await sleep(900);
    await t.pointer.park(1500, 720);
    await shot("0");
    await t.rec.start();
    t.rec.markIn(0.2);
    await sleep(600);
    const price = p.locator(".market-price-btn:visible").nth(1);
    await t.pointer.click(price, { ms: 1000, settle: 80 });
    await p.locator(".market-sales-list").waitFor({ timeout: 8000 });
    await sleep(1100);
    await shot("1");
    await p.keyboard.press("Escape");
    await sleep(250);
    // One tab, one window: the link normally opens a new tab.
    await p.evaluate(() => document.querySelector<HTMLAnchorElement>("a.duel-play-btn")?.removeAttribute("target"));
    await t.pointer.click(p.locator("a.duel-play-btn"), { ms: 900, settle: 120 });
    await p.waitForURL(/\/decks\?planner/, { timeout: 15_000 });
    await sleep(1800);
    await shot("2");
  } finally {
    await finishTake(t).catch(() => undefined);
  }
}
