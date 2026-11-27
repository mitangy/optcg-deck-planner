import { readFileSync } from "node:fs";
import { join } from "node:path";
import { sleep } from "../lib/util";
import { ASSET_DIR } from "../lib/env";
import { finishTake } from "../lib/take";
import { hypeTake, HYPE_SETTINGS } from "../lib/hype";
import { matchesOfMiko } from "../lib/world";
import type { FakeMatch } from "../lib/fakeApi";

export const id = "hype-review";
const MATCH_ID = "g9";

/** /replay/:id?review=1: the game review strip grades every move (the review runs in a worker in the page, no API needed). */
export async function run(): Promise<void> {
  const rec = JSON.parse(readFileSync(join(ASSET_DIR, "match.json"), "utf8")) as { replay: unknown; log: unknown; turns: number };
  const row: FakeMatch = {
    match_id: MATCH_ID, created_at: new Date(Date.now() - 2 * 3_600_000).toISOString(), ranked: true, your_seat: 0, won: true,
    reason: "leader_battle_at_zero_life", turns: rec.turns, your_leader_id: "ST01-001", opponent_leader_id: "OP01-031", opponent_name: "NamiNavigator",
    rating_before: 1670, rating_after: 1684, has_replay: true, replay_ready: true, finished: true,
  };
  const t = await hypeTake(id, {
    seed: { settings: { ...HYPE_SETTINGS, theme: "nightSea" } },
    fake: {
      logPose: true,
      matches: [row, ...matchesOfMiko()],
      details: { [MATCH_ID]: { match: { ...row, has_log: true }, log: rec.log } },
      replays: { [MATCH_ID]: { match_id: MATCH_ID, your_seat: 0, players: ["Miko", "NamiNavigator"], finished: true, turns: rec.turns, replay: rec.replay } },
    },
  });
  const p = t.page;
  const shot = async (n: string) => { if (process.env.SHOTS) await p.screenshot({ path: `/tmp/shots/${id}-${n}.png` }); };
  try {
    await t.goto(`/replay/${MATCH_ID}?review=1`);
    await p.locator(".replay-controls").waitFor({ timeout: 30_000 });
    await sleep(1500);
    await t.pointer.park(1100, 700);
    await shot("0");
    await t.rec.start();
    t.rec.markIn(0.2);
    await sleep(2600); // the review finishes in a worker; accuracy and key moments fill in
    t.rec.mark("summary");
    await shot("summary");
    const fwd = p.getByRole("button", { name: "Step forward" });
    const next = p.getByRole("button", { name: "Next turn" });
    await t.pointer.click(next, { ms: 700, settle: 60 });
    await sleep(500);
    for (let i = 0; i < 4; i++) {
      await t.pointer.click(next, { ms: i ? 260 : 400, settle: 60 });
      await sleep(900);
      await shot(`turn${i}`);
      t.rec.mark(`turn${i}`);
    }
    for (let i = 0; i < 6; i++) {
      await t.pointer.click(fwd, { ms: 240, settle: 40 });
      await sleep(750);
      await shot(`step${i}`);
      t.rec.mark(`step${i}`);
    }
  } catch (e) {
    console.error(`[${id}]`, e);
    if (process.env.SHOTS) await p.screenshot({ path: `/tmp/shots/${id}-error.png` }).catch(() => undefined);
    throw e;
  } finally {
    await finishTake(t);
  }
}
