/**
 * Fixed-seed fuzz smoke for PR CI: the same games every run, so a failure is
 * reproducible from the printed seed (`npx tsx src/sim/fuzz.ts 1 <seed>`).
 *
 * Usage: npx tsx src/sim/fuzzSmoke.ts [games] [firstSeed]
 */
import { fuzzGame } from "./fuzz.js";

export const SMOKE_FIRST_SEED = 1;
export const SMOKE_GAMES = 150;

export interface SmokeResult { games: number; finished: number; intents: number; failures: string[] }

export function runSmoke(games = SMOKE_GAMES, firstSeed = SMOKE_FIRST_SEED): SmokeResult {
  const out: SmokeResult = { games, finished: 0, intents: 0, failures: [] };
  for (let seed = firstSeed; seed < firstSeed + games; seed += 1) {
    const result = fuzzGame(seed);
    out.intents += result.intents;
    if (result.finished) out.finished += 1;
    if (result.error) out.failures.push(`${result.error}\n    replay: npx tsx src/sim/fuzz.ts 1 ${seed}`);
  }
  return out;
}

if (process.argv[1] && /fuzzSmoke\.ts$/.test(process.argv[1])) {
  const started = Date.now();
  const result = runSmoke(Number(process.argv[2] ?? SMOKE_GAMES), Number(process.argv[3] ?? SMOKE_FIRST_SEED));
  for (const failure of result.failures) console.error(`FAIL ${failure}`);
  console.log(`fuzz smoke: ${result.games} games, ${result.finished} finished, ${result.failures.length} failed, ${result.intents} intents, ${((Date.now() - started) / 1000).toFixed(1)}s`);
  if (result.failures.length) process.exit(1);
}
