import type { getPlayerView } from "../engine.js";
import type { Rng } from "../rng.js";
import type { Intent } from "../types.js";
import type { PriorChoice } from "./determinize.js";
import type { PlaybookSetting } from "./playbooks/index.js";
import type { ValueModel } from "./valueModel.js";

export type BotView = ReturnType<typeof getPlayerView>;
export type BotLevel = "easy" | "normal" | "hard";

export interface BotOptions {
  level?: BotLevel;
  rng?: Rng;
  budgetMs?: number;
  samples?: number;
  maxEvals?: number;
  horizonTurns?: 1 | 2;
  evalMode?: "learned" | "hand";
  valueWeights?: ValueModel;
  prior?: PriorChoice;
  opponentModel?: "normal" | "greedy";
  mulligan?: "sim" | "rule";
  playbooks?: PlaybookSetting;
  onTrace?: (trace: HardTrace) => void;
}

export interface HardTrace {
  candidates: Intent[];
  scores: (number | null)[][];
  chosen: number;
}
