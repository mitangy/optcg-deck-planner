/** 01-landing (5s): the lobby with the deck hero and live side cards, the cursor drifting slowly to Play. */
import { sleep } from "../lib/util";
import { finishTake, settle, startTake, type Take } from "../lib/take";
import { MIKO } from "../lib/data";
import { friendsOfMiko, leaderboard, matchesOfMiko, MIKO_STATS } from "../lib/world";

export const id = "01-landing";

export async function run(): Promise<void> {
  const t = await startTake({
    id,
    cursor: "arrow",
    fake: {
      me: { ...MIKO, ...MIKO_STATS },
      friends: friendsOfMiko(),
      matches: matchesOfMiko(),
      leaderboard: leaderboard({ uid: MIKO.uid, name: MIKO.name, rating: MIKO_STATS.rating }),
      live: { online: 214, matches: 37 },
      logPose: true,
    },
  });
  try {
    await t.goto("/");
    await ready(t);
    await t.pointer.park(1480, 860);
    await settle(1500);
    await t.rec.start();
    t.rec.markIn(0.15);
    await sleep(700);
    const play = t.page.getByRole("button", { name: /^Play/ }).first();
    await t.pointer.hover(play, { ms: 3300, curve: 0.5 });
    await sleep(1100);
  } finally {
    await finishTake(t);
  }
}

/** Everything the first frame needs: art, friends, voyage and bounties are in, nothing is loading. */
export async function ready(t: Take): Promise<void> {
  const page = t.page;
  await page.locator(".friend-row").first().waitFor({ timeout: 15_000 });
  await page.locator(".voyage-row").first().waitFor({ timeout: 15_000 });
  await page.locator(".bounty-row").first().waitFor({ timeout: 15_000 });
  await page.waitForFunction(() => [...document.images].every((i) => i.complete && i.naturalWidth > 0), null, { timeout: 20_000 });
}
