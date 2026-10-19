/**
 * Position analysis for Log Pose (#635): how likely a seat is to win from a position, and how the options it
 * has there compare. Like the hard bot, it only searches determinized copies of the state, so it never uses the
 * seat's hidden information. STUB: the real implementation (learned value model + hard search) replaces this.
 */
import { applyIntent, getPlayerView } from "../engine.js";
import { createSeededRng, type Rng } from "../rng.js";
import type { Intent, MatchState, Seat } from "../types.js";
import { evaluate } from "./evaluate.js";

export interface PositionOption {
  intent: Intent;
  /** Plain-English description of the intent ("Play Nami (OP01-016)", "Attack the Leader with Zoro"). */
  label: string;
  /** Estimated chance (0..1) that `seat` wins after taking this option. */
  winChance: number;
  /** Determinized games behind the estimate. */
  samples: number;
  /** The option the hard bot would pick. */
  isBotPick: boolean;
}

export interface AnalysisOptions {
  budgetMs?: number;
  samples?: number;
  rng?: Rng;
}

/** Estimated chance (0..1) that `seat` wins from `state`. */
export function winProbability(state: MatchState, seat: Seat): number {
  if (state.winner !== null) return state.winner === seat ? 1 : 0;
  return 1 / (1 + Math.exp(-evaluate(state, seat) / 4));
}

/** The seat's options in `state`, best first. Empty when it is not the seat's move. */
export function rankOptions(state: MatchState, seat: Seat, opts: AnalysisOptions = {}): PositionOption[] {
  void (opts.rng ?? createSeededRng(1));
  const legal = getPlayerView(state, seat).legalIntents;
  const out: PositionOption[] = [];
  for (const intent of legal) {
    const r = applyIntent(state, intent, { seat, rng: createSeededRng(state.rng.seed) });
    if (!r.ok) continue;
    out.push({ intent, label: intent.type, winChance: winProbability(r.state, seat), samples: 1, isBotPick: false });
  }
  out.sort((a, b) => b.winChance - a.winChance);
  if (out[0]) out[0].isBotPick = true;
  return out;
}
