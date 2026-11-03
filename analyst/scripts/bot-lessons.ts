/**
 * Draft lesson candidates where bot self-play games and real games agree (#635, #915).
 *
 *   npx tsx analyst/scripts/bot-lessons.ts --leader OP01-001 [--opponent OP02-001] [--real-games 60] [--max-per-leader 3] [--post]
 *   npx tsx analyst/scripts/bot-lessons.ts --all-leaders [--min-games 60] [--max-per-leader 3] [--post]
 *
 * Reads the bot line stats (sim_stats) and tallies the same lines in the leader's real archive games, then prints the
 * lines both show moving the same way (the best --max-per-leader per leader). With --post each one is saved through
 * POST /analyst/bot-lessons as a draft owned by the admin: they approve it in the duel app (Settings, Log Pose), and
 * an approved one reaches every player's Log Pose with the sim stats. A lesson the planner already has, in any status,
 * is skipped, so a weekly run adds nothing twice. Needs ANALYST_API_URL and ANALYST_SERVICE_SECRET (no personal token).
 */
import { DEFAULT_MAX_PER_LEADER, DEFAULT_MIN_LEADER_GAMES, cardsOfLine, evidenceSummary, leadersWithGames, lessonsForLeader, postBotLesson } from "../src/botGames";
import { plannerCall, type PlannerApi } from "../src/matches";

const flag = (name: string) => {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
};
const has = (name: string) => process.argv.includes(`--${name}`);
const allLeaders = has("all-leaders");
const leader = flag("leader")?.toUpperCase();
const opponent = flag("opponent")?.toUpperCase();
const realGames = Number(flag("real-games") ?? 60);
const max = Number(flag("max-per-leader") ?? DEFAULT_MAX_PER_LEADER);
const minGames = Number(flag("min-games") ?? DEFAULT_MIN_LEADER_GAMES);
const post = has("post");
const api: PlannerApi = { baseUrl: process.env.ANALYST_API_URL ?? "", serviceSecret: process.env.ANALYST_SERVICE_SECRET ?? "" };
if ((!leader && !allLeaders) || (leader && allLeaders) || !api.baseUrl || !api.serviceSecret) {
  console.error(
    "usage: bot-lessons.ts (--leader OP01-001 [--opponent OP02-001] | --all-leaders [--min-games 60]) [--real-games 60] [--max-per-leader 3] [--post]   (needs ANALYST_API_URL and ANALYST_SERVICE_SECRET)",
  );
  process.exit(2);
}

const leaders = allLeaders
  ? leadersWithGames(await plannerCall<{ leaders?: { leader: string; games: number }[] }>(api, null, "/analyst/stats/sim?levels=hard%2Fhard", true), minGames)
  : [leader!];
console.log(`${leaders.length} leader${leaders.length === 1 ? "" : "s"} to check${allLeaders ? ` (at least ${minGames} bot games each)` : ""}.`);

let found = 0;
let saved = 0;
let skipped = 0;
let failed = 0;
for (const id of leaders) {
  try {
    const run = await lessonsForLeader(api, id, { ...(opponent ? { opponent } : {}), realGames, max });
    console.log(`${id}${opponent ? ` vs ${opponent}` : ""}: ${run.botLines} bot lines, ${run.realGames} real games, ${run.lessons.length} lessons where both agree`);
    for (const c of run.lessons) {
      found += 1;
      console.log(`- ${c.text}`);
      if (!post) continue;
      const r = await postBotLesson(api, { text: c.text, leader_id: id, ...(opponent ? { opponent_id: opponent } : {}), cards: cardsOfLine(c.line), evidence: evidenceSummary(c) });
      if (r.skipped) skipped += 1;
      else saved += 1;
    }
  } catch (err) {
    failed += 1;
    console.error(`${id}: ${err instanceof Error ? err.message : err}`);
  }
}
console.log(`Bot lessons: ${found} found${post ? `, ${saved} saved as drafts, ${skipped} already there` : " (not posted: add --post)"}${failed ? `, ${failed} leaders failed` : ""}.`);
if (failed && failed === leaders.length) process.exit(1);
