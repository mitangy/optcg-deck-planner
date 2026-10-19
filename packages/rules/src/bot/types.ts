import type { getPlayerView } from "../engine.js";
import type { Rng } from "../rng.js";
import type { Intent } from "../types.js";

export type BotView = ReturnType<typeof getPlayerView>;
export type BotLevel = "easy" | "normal" | "hard";

export interface BotOptions {
  level?: BotLevel;
  /** Seeded rng for tie-breaks; the same view, level and rng state always give the same intent. */
  rng?: Rng;
  /** Hard only: wall-clock budget for one decision in milliseconds (default 200). `Infinity` searches every candidate on every sample. */
  budgetMs?: number;
  /** Hard only: how many determinized copies of the hidden information to search (default 3). */
  samples?: number;
  /** Hard only: stop after this many candidate evaluations (a rollout each). With `budgetMs: Infinity` this makes the search independent of the clock. */
  maxEvals?: number;
  /** Hard only: 1 looks to the end of the current turn (default), 2 also plays the opponent's next turn. */
  horizonTurns?: 1 | 2;
  /** Hard only: called once for every decision that was really searched (two or more candidates). */
  onTrace?: (trace: HardTrace) => void;
}

/** What one hard-bot search looked at: for tests, logs and tuning. */
export interface HardTrace {
  candidates: Intent[];
  /** scores[c][k]: score of candidate c on determinized copy k, or null when it was not evaluated or failed. */
  scores: (number | null)[][];
  /** Index into `candidates` of the intent sent (0 is the normal policy's own pick). */
  chosen: number;
}
