/** Finished bot games for tests (#635): easy bots through the real engine, so the replays are real-format. */
import type { MatchReplay } from "@optcg/rules";
import { createSeededRng } from "@optcg/rules";
import { playBotGame, type BotGameResult } from "@optcg/rules/src/sim/selfPlay";
import { randomDeck } from "@optcg/rules/src/sim/fuzz";

export function botGame(seed: number, level: "easy" | "normal" = "easy"): BotGameResult {
  const rng = createSeededRng(seed);
  return playBotGame({ seed, players: [randomDeck(rng), randomDeck(rng)], levels: [level, level] });
}

/** The first finished game with at least `minTurns` turns, searching upward from `from`. */
export function finishedGame(minTurns: number, from = 1): { replay: MatchReplay; result: BotGameResult } {
  for (let seed = from; seed < from + 60; seed += 1) {
    const result = botGame(seed);
    if (result.winner !== null && result.turns >= minTurns && result.replay.end) return { replay: result.replay, result };
  }
  throw new Error(`no finished game with ${minTurns} turns`);
}
