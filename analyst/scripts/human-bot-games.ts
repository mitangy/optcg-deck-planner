/**
 * Download the Play vs Bot games players have played, for the weekly value model refit (#1202).
 *
 *   npx tsx analyst/scripts/human-bot-games.ts --out games/human-bot/games.jsonl [--api https://api.example]
 *
 * One MatchReplay per line, the format packages/rules/src/sim/fitValue.ts --in reads. The API base URL comes from
 * --api or ANALYST_API_URL, the secret from ANALYST_SERVICE_SECRET; without either the script says so and exits 0,
 * so a scheduled run on a repo without them set up is not a failure. The export carries no player identifiers, and
 * leaves out players who turned off sharing their games with Log Pose.
 */
import { appendFileSync, mkdirSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { fetchHumanBotGames } from "../src/botGames";

const flag = (name: string) => {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
};
const out = flag("out");
const baseUrl = flag("api") ?? process.env.ANALYST_API_URL ?? "";
const serviceSecret = process.env.ANALYST_SERVICE_SECRET ?? "";
if (!out) {
  console.error("usage: human-bot-games.ts --out games/human-bot/games.jsonl [--api URL]");
  process.exit(2);
}
if (!baseUrl || !serviceSecret) {
  console.log("Skipping the Play vs Bot download: ANALYST_API_URL (or --api) and ANALYST_SERVICE_SECRET are not both set.");
  process.exit(0);
}
mkdirSync(dirname(out), { recursive: true });
writeFileSync(out, "");
const total = await fetchHumanBotGames({ baseUrl, serviceSecret }, (games) => appendFileSync(out, games.map((g) => JSON.stringify(g.replay)).join("\n") + "\n"));
console.log(`wrote ${total} Play vs Bot games to ${out}`);
