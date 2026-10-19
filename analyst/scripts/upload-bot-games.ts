/**
 * Upload self-play games to Log Pose's bot game corpus (#635).
 *
 *   npx tsx analyst/scripts/upload-bot-games.ts selfplay-hard-hard-seed2000-n40.jsonl [more.jsonl]
 *        [--api https://api.example] [--levels hard/hard] [--paired] [--batch-id nightly-2026-10-19] [--dry-run]
 *
 * The API base URL comes from --api or ANALYST_API_URL, the secret from ANALYST_SERVICE_SECRET. Without either the
 * script says so and exits 0, so a scheduled run on a repo without the secrets set up is not a failure.
 * Sending the same batch id again adds nothing (the id defaults to the file name plus a hash of its contents).
 */
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { basename } from "node:path";
import { parseJsonl, tallyReplay, uploadBotGames, type BotGameUpload } from "../src/botGames";

function flag(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

const valueFlags = new Set(["--api", "--levels", "--batch-id"]);
const files = process.argv.slice(2).filter((a, i, all) => !a.startsWith("--") && !valueFlags.has(all[i - 1] ?? ""));
const baseUrl = flag("api") ?? process.env.ANALYST_API_URL ?? "";
const serviceSecret = process.env.ANALYST_SERVICE_SECRET ?? "";
const dryRun = process.argv.includes("--dry-run");
const paired = process.argv.includes("--paired");

if (!files.length) {
  console.error("usage: upload-bot-games.ts <file.jsonl>... [--api URL] [--levels hard/hard] [--paired] [--batch-id id] [--dry-run]");
  process.exit(2);
}
if (!dryRun && (!baseUrl || !serviceSecret)) {
  console.log("Skipping the bot game upload: ANALYST_API_URL (or --api) and ANALYST_SERVICE_SECRET are not both set.");
  process.exit(0);
}

let failed = false;
for (const file of files) {
  const text = readFileSync(file, "utf8");
  const name = basename(file).replace(/\.jsonl$/, "");
  const fromName = /selfplay-([a-z]+)-([a-z]+)-seed/.exec(name);
  const levels = flag("levels") ?? (fromName ? `${fromName[1]}/${fromName[2]}` : "");
  const [first, second] = levels.split("/");
  const batchId = flag("batch-id") ?? `${name}-${createHash("sha1").update(text).digest("hex").slice(0, 10)}`.slice(0, 64);
  const { replays, skipped } = parseJsonl(text);
  const games: BotGameUpload[] = replays.map(({ replay, tallies }, index) => {
    const counted = tallyReplay(replay);
    return {
      index,
      replay,
      tallies: tallies ?? counted.tallies,
      turns: counted.turns,
      // Paired runs swap which level sits in which seat every other game.
      ...(paired && first && second && first !== second ? { levels: index % 2 === 1 ? `${second}/${first}` : `${first}/${second}` } : {}),
    };
  });
  console.log(`${file}: ${games.length} games${skipped ? `, ${skipped} unreadable lines skipped` : ""}, levels ${levels || "unknown"}, batch ${batchId}`);
  if (dryRun) continue;
  try {
    const r = await uploadBotGames({ baseUrl, serviceSecret }, batchId, levels, games);
    console.log(`  uploaded: ${r.accepted} new, ${r.duplicates} already there, ${r.rejected.length} rejected`);
    for (const x of r.rejected.slice(0, 5)) console.log(`  rejected game ${x.index}: ${x.reason}`);
  } catch (err) {
    failed = true;
    console.error(`  upload failed: ${err instanceof Error ? err.message : String(err)}`);
  }
}
process.exit(failed ? 1 : 0);
