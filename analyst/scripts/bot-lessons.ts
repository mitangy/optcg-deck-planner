/**
 * Draft lesson candidates where bot self-play games and real games agree (#635).
 *
 *   npx tsx analyst/scripts/bot-lessons.ts --leader OP01-001 [--opponent OP02-001] [--real-games 60] [--post]
 *
 * Reads the bot line stats (sim_stats) and tallies the same lines in the leader's real archive games, then prints the
 * lines both show moving the same way. With --post (and ANALYST_TOKEN, the owner's personal connector token) each one is
 * saved as a draft lesson for the owner to approve in the duel app (Settings, Log Pose). ANALYST_API_URL and
 * ANALYST_SERVICE_SECRET name the planner API and its service secret.
 */
import type { MatchReplay, Seat } from "@optcg/rules";
import { cardsOfLine, compareLines, lessonText, linesOf, realLineStats, tallyReplay, type LineRow } from "../src/botGames";
import { cardName, draftLesson, plannerCall, type PlannerApi } from "../src/matches";

const flag = (name: string) => {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
};
const leader = flag("leader")?.toUpperCase();
const opponent = flag("opponent")?.toUpperCase();
const realMax = Number(flag("real-games") ?? 60);
const api: PlannerApi = { baseUrl: process.env.ANALYST_API_URL ?? "", serviceSecret: process.env.ANALYST_SERVICE_SECRET ?? "" };
if (!leader || !api.baseUrl || !api.serviceSecret) {
  console.error("usage: bot-lessons.ts --leader OP01-001 [--opponent OP02-001] [--real-games 60] [--post]   (needs ANALYST_API_URL and ANALYST_SERVICE_SECRET)");
  process.exit(2);
}

const query = new URLSearchParams({ leader, levels: "hard/hard" });
if (opponent) query.set("opponent", opponent);
const sim = await plannerCall<{ lines?: LineRow[] }>(api, null, `/analyst/stats/sim?${query}`, true);
const bot = sim.lines ?? [];

const real: { lines: Set<string>; won: boolean }[] = [];
const search = new URLSearchParams({ leader, limit: "50" });
if (opponent) search.set("opponent", opponent);
for (let offset = 0; real.length < realMax; offset += 50) {
  search.set("offset", String(offset));
  const page = await plannerCall<{ games: { game_id: string; has_replay: boolean }[] }>(api, null, `/analyst/corpus/games?${search}`, true);
  if (!page.games.length) break;
  for (const g of page.games) {
    if (!g.has_replay || real.length >= realMax) continue;
    try {
      const { replay } = await plannerCall<{ replay: MatchReplay }>(api, null, `/analyst/corpus/games/${g.game_id}/replay`, true);
      const seats = ([0, 1] as Seat[]).filter((s) => replay.players[s].leaderId === leader);
      if (seats.length !== 1 || !replay.end) continue;
      const seat = seats[0]!;
      real.push({ lines: linesOf(tallyReplay(replay).tallies[seat]), won: replay.end.winner === seat });
    } catch {
      /* a game the engine no longer replays is left out */
    }
  }
}

const found = compareLines(bot, realLineStats(real));
console.log(`${leader}${opponent ? ` vs ${opponent}` : ""}: ${bot.length} bot lines, ${real.length} real games, ${found.length} lines where both agree`);
const name = cardName(leader) ?? leader;
const token = process.env.ANALYST_TOKEN;
for (const c of found) {
  const text = lessonText(c, name);
  console.log(`- ${text}`);
  if (process.argv.includes("--post")) {
    if (!token) throw new Error("--post needs ANALYST_TOKEN (the owner's personal connector token).");
    await draftLesson(api, token, { text, leader_id: leader, ...(opponent ? { opponent_id: opponent } : {}), cards: cardsOfLine(c.line) });
  }
}
