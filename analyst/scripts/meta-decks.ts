/**
 * Write the current meta decks for the bot self-play recorder (#635).
 *
 *   npx tsx analyst/scripts/meta-decks.ts --api https://backend.example --out meta-decks.json [--leaders 16] [--days 30]
 *
 * The output is the --decks file packages/rules/src/sim/selfPlay.ts reads: [{ name, leaderId, deck: [50 ids] }].
 */
import { writeFileSync } from "node:fs";
import { fetchSelfPlayDecks } from "../src/metaDecks";

const flag = (name: string) => {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
};
const api = flag("api") ?? process.env.META_API_URL ?? process.env.ANALYST_API_URL;
const out = flag("out");
if (!api || !out) {
  console.error("usage: meta-decks.ts --api https://backend.example --out meta-decks.json [--leaders 16] [--days 30]");
  process.exit(2);
}
const decks = await fetchSelfPlayDecks(api, { leaders: Number(flag("leaders") ?? 16), days: Number(flag("days") ?? 30) });
if (decks.length < 2) {
  console.error(`Only ${decks.length} meta decks found at ${api}; self-play needs at least 2.`);
  process.exit(1);
}
writeFileSync(out, JSON.stringify(decks));
console.log(`wrote ${decks.length} meta decks to ${out}: ${decks.map((d) => d.leaderId).join(", ")}`);
