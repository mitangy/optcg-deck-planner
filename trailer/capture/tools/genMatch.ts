/**
 * Plays one bot-vs-bot game on the local rules engine with the trailer's decks and writes the recording the faked
 * history API serves for the Log Pose and replay clips: assets/match.json.   npx tsx tools/genMatch.ts [seed ...]
 * Picks the first seed (from the arguments, else 1..60) in which Miko (seat 0, Straw Hats) wins in 8 to 12 turns.
 */
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { playBotGame } from "../../../packages/rules/src/sim/selfPlay";
import { seatLog } from "../../../packages/rules/src/seatLog";
import { STRAW_HATS, WANO } from "../lib/data";
import { ASSET_DIR } from "../lib/env";

const seeds = process.argv.slice(2).map(Number);
const candidates = seeds.length ? seeds : Array.from({ length: 60 }, (_, i) => i + 1);
for (const seed of candidates) {
  const r = playBotGame({
    seed,
    firstSeat: 0,
    players: [{ leaderId: STRAW_HATS.leaderId, deck: STRAW_HATS.cards }, { leaderId: WANO.leaderId, deck: WANO.cards }],
    levels: ["normal", "normal"],
  });
  console.log(`seed ${seed}: winner ${r.winner} turns ${r.turns} intents ${r.intents} ${r.stoppedEarly ?? ""}`);
  if (r.winner !== 0 || r.stoppedEarly || r.turns < 8 || r.turns > 12) continue;
  const log = seatLog(r.replay, 0);
  const out = { seed, turns: r.turns, replay: r.replay, log };
  writeFileSync(join(ASSET_DIR, "match.json"), JSON.stringify(out));
  console.log(`wrote assets/match.json (seed ${seed}, ${r.turns} turns)`);
  break;
}
