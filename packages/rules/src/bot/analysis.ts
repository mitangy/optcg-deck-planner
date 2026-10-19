/**
 * Position analysis for Log Pose (#635): how likely a seat is to win from a position, and how the options it has there
 * compare. Like the hard bot it only searches determinized copies of the state, so it never uses the seat's hidden
 * information. Runs on the analyst service (Node), so every call takes a time budget.
 */
import { getPlayerView } from "../engine.js";
import { createSeededRng } from "../rng.js";
import type { Rng } from "../rng.js";
import type { Intent, MatchState, Seat } from "../types.js";
import { describeIntent } from "./labels.js";
import { peekNormalIntent } from "./policy.js";
import { candidatesFor, searchCandidates } from "./search.js";
import type { BotOptions } from "./types.js";
import { extractFeatures } from "./features.js";
import { logitOf, sigmoid } from "./valueModel.js";

export interface PositionOption {
  intent: Intent;
  /** Plain-English description of the intent ("Play Nami (OP01-016)", "Attack the Leader with Zoro"). */
  label: string;
  /** Estimated chance (0..1) that `seat` wins after taking this option: the mean learned win probability after a rollout to the end of the turn, over `samples` determinized games. */
  winChance: number;
  /** Determinized games behind the estimate. */
  samples: number;
  /** The option the hard bot would pick. */
  isBotPick: boolean;
}

export interface AnalysisOptions {
  /** Wall-clock budget in ms (default 1500). The search is anytime: a smaller budget scores fewer samples per option. */
  budgetMs?: number;
  /** Determinized samples per option (default 6). */
  samples?: number;
  rng?: Rng;
  /** Passed to the search (prior, opponentModel, ...). */
  search?: Pick<BotOptions, "prior" | "opponentModel" | "horizonTurns" | "maxEvals" | "evalMode">;
}

export const ANALYSIS_DEFAULTS = { budgetMs: 1500, samples: 6 } as const;

/** Learned chance (0..1) that `seat` wins from `state`, as it stands (no search). Exactly 0 or 1 once the game is over. */
export function winProbability(state: MatchState, seat: Seat): number {
  if (state.winner !== null) return state.winner === seat ? 1 : 0;
  return sigmoid(logitOf(extractFeatures(state, seat)));
}

/**
 * The seat's options in `state`, best first by win chance (the learned win probability after a rollout to the end of the turn). Empty when it is not the seat's move. The options are the
 * hard bot's candidates (search.ts), each scored on the same determinized games; options the budget did not reach are left out.
 * `isBotPick` marks the option the hard bot picks with the same samples (the best average within its margin of normal's pick).
 */
export function rankOptions(state: MatchState, seat: Seat, opts: AnalysisOptions = {}): PositionOption[] {
  const view = getPlayerView(state, seat);
  if (!view.legalIntents.length) return [];
  const rng = opts.rng ?? createSeededRng(1);
  const base = peekNormalIntent(view, rng);
  if (!base) return [];
  const candidates = candidatesFor(view, base, rng, true);
  const result = searchCandidates(state, seat, view, base, candidates, rng, {
    ...opts.search,
    rng,
    budgetMs: opts.budgetMs ?? ANALYSIS_DEFAULTS.budgetMs,
    samples: opts.samples ?? ANALYSIS_DEFAULTS.samples,
  }, true);
  if (!result) {
    // A lone option: nothing to compare, so only the position's own win chance.
    const only = candidates[0] ?? base;
    return [{ intent: only, label: describeIntent(state, seat, only), winChance: winProbability(state, seat), samples: 0, isBotPick: true }];
  }
  const out: PositionOption[] = [];
  result.candidates.forEach((intent, c) => {
    const probs = result.probs[c]!.filter((v): v is number => v != null);
    if (!probs.length) return;
    out.push({ intent, label: describeIntent(state, seat, intent), winChance: probs.reduce((a, b) => a + b, 0) / probs.length, samples: probs.length, isBotPick: c === result.chosen });
  });
  out.sort((a, b) => b.winChance - a.winChance);
  return out;
}
