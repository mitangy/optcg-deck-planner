/** 09-logpose (6s): Log Pose reviews a finished match (the analyst's reply is faked in the page), then the replay viewer steps through turns. */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { sleep } from "../lib/util";
import { ASSET_DIR } from "../lib/env";
import { finishTake, startTake } from "../lib/take";
import { MIKO } from "../lib/data";
import { MIKO_STATS, friendsOfMiko, matchesOfMiko } from "../lib/world";
import type { FakeMatch } from "../lib/fakeApi";

export const id = "09-logpose";
const MATCH_ID = "g9";

/** The review Log Pose "writes": it only states things that happen in assets/match.json (turn numbers, counters, damage). */
const REVIEW = [
  "**A clean win on turn 9, and you earned it by making them spend their counters first.**\n\n",
  "**Turn 5 set the pace.** Monkey.D.Luffy came down with 5 DON!!, and three swings at the Leader took two of their Life cards before they had a board.\n\n",
  "**Turn 7 was the swing turn.** Four attacks: the first was blocked, Otsuru and Urouge stopped the next two, and the last one still landed.\n\n",
  "**Turn 9 was the lethal line.** Your first two attacks ate Wire, Killer and Raizo as counters. Then a hit, and the 9000 swing with 4 DON!! on your Leader ended it.\n\n",
  "**One thing to tighten.** On turn 8 you spent Nico Robin and Brook saving one Character, and the next attack K.O.'d Roronoa Zoro. One more counter held back would have kept it.",
];

export async function run(): Promise<void> {
  const rec = JSON.parse(readFileSync(join(ASSET_DIR, "match.json"), "utf8")) as { replay: unknown; log: unknown; turns: number };
  const row: FakeMatch = {
    match_id: MATCH_ID, created_at: new Date(Date.now() - 2 * 3_600_000).toISOString(), ranked: true, your_seat: 0, won: true,
    reason: "leader_battle_at_zero_life", turns: rec.turns, your_leader_id: "ST01-001", opponent_leader_id: "OP01-031", opponent_name: "NamiNavigator",
    rating_before: 1670, rating_after: 1684, has_replay: true, replay_ready: true, finished: true,
  };
  const t = await startTake({
    id,
    fake: {
      me: { ...MIKO, ...MIKO_STATS }, friends: friendsOfMiko(), logPose: true,
      matches: [row, ...matchesOfMiko()],
      details: { [MATCH_ID]: { match: { ...row, has_log: true }, log: rec.log } },
      replays: { [MATCH_ID]: { match_id: MATCH_ID, your_seat: 0, players: ["Miko", "NamiNavigator"], finished: true, turns: rec.turns, replay: rec.replay } },
    },
  });
  const p = t.page;
  const shot = async (n: string) => { if (process.env.SHOTS) await p.screenshot({ path: `/tmp/shots/${id}-${n}.png` }); };
  // Log Pose's answer is streamed by the page itself (the analyst service does not exist here), word by word, once told to start.
  await t.win.ctx.addInitScript((review: string[]) => {
    const real = window.fetch.bind(window);
    window.fetch = (input: RequestInfo | URL, init?: RequestInit) => {
      const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
      if (!url.endsWith("/review-match")) return real(input, init);
      const enc = new TextEncoder();
      const send = (c: ReadableStreamDefaultController, event: string, data: unknown) => c.enqueue(enc.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`));
      const body = new ReadableStream({
        async start(c) {
          const w = window as unknown as { __reviewGo?: Promise<void> };
          await (w.__reviewGo ??= new Promise<void>((r) => { (window as unknown as { __startReview: () => void }).__startReview = r; }));
          const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));
          send(c, "status", { text: "Reading the turn log…" });
          await wait(650);
          send(c, "status", { text: "Checking the counters and the damage…" });
          await wait(600);
          let sent = 0;
          for (const [i, block] of review.entries()) {
            for (const word of block.split(/(?<= )/)) {
              send(c, "text", { delta: word });
              sent += word.length;
              await wait(19);
            }
            if (i === 2) send(c, "cite", { citations: [{ source: "match:g9#t7", title: "Turn 7", cited_text: "Four attacks: the first was blocked, Otsuru and Urouge stopped the next two" }] });
          }
          send(c, "done", {});
          c.close();
        },
      });
      return Promise.resolve(new Response(body, { status: 200, headers: { "content-type": "text/event-stream" } }));
    };
  }, REVIEW);
  const go = () => p.evaluate(() => {
    const w = window as unknown as { __startReview?: () => void; __reviewGo?: Promise<void> };
    if (w.__startReview) w.__startReview();
    else w.__reviewGo = Promise.resolve();
  });
  try {
    await t.goto(`/history/${MATCH_ID}`);
    await p.locator(".lp-review").waitFor({ timeout: 20_000 });
    await sleep(1500);
    await t.pointer.park(1500, 600);
    await shot("0");
    await t.rec.start();
    t.rec.markIn(0.2);
    await sleep(500);
    await go();
    await sleep(5700);
    await shot("1");
    t.rec.cut();
    await t.goto(`/replay/${MATCH_ID}`);
    await p.locator(".replay-controls").waitFor({ timeout: 30_000 });
    await sleep(2500);
    await shot("2");
    t.rec.markIn(0.1);
    await sleep(500);
    const next = p.getByRole("button", { name: "Next turn" });
    for (let i = 0; i < 4; i++) {
      await t.pointer.click(next, { ms: i ? 220 : 700, settle: 60 });
      await sleep(650);
    }
    await shot("3");
  } finally {
    await finishTake(t);
  }
}
