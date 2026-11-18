import { getPlayerView } from "../engine.js";
import { createSeededRng } from "../rng.js";
import type { Rng } from "../rng.js";
import type { Intent, MatchState, Seat } from "../types.js";
import { describeIntent } from "./labels.js";
import { peekNormalIntent } from "./policy.js";
import { candidatesFor, searchCandidates } from "./search.js";
import type { BotOptions } from "./types.js";
import { stableJson } from "../review/classify.js";
import { learnedLogit, sigmoid } from "./valueModel.js";

export interface PositionOption {
  intent: Intent;
  label: string;
  winChance: number;
  samples: number;
  isBotPick: boolean;
}

export interface AnalysisOptions {
  budgetMs?: number;
  samples?: number;
  rng?: Rng;
  include?: Intent[];
  search?: Pick<BotOptions, "prior" | "opponentModel" | "horizonTurns" | "maxEvals" | "evalMode" | "playbooks">;
}

export const ANALYSIS_DEFAULTS = { budgetMs: 1500, samples: 6 } as const;

export function winProbability(state: MatchState, seat: Seat): number {
  if (state.winner !== null) return state.winner === seat ? 1 : 0;
  return sigmoid(learnedLogit(state, seat));
}

export function rankOptions(state: MatchState, seat: Seat, opts: AnalysisOptions = {}): PositionOption[] {
  const view = getPlayerView(state, seat);
  if (!view.legalIntents.length) return [];
  const rng = opts.rng ?? createSeededRng(1);
  const base = peekNormalIntent(view, rng, opts.search?.playbooks ?? true);
  if (!base) return [];
  const candidates = candidatesFor(view, base, rng, true);
  for (const extra of opts.include ?? []) {
    const key = stableJson(extra);
    if (!candidates.some((c) => stableJson(c) === key)) candidates.push(extra);
  }
  const result = searchCandidates(state, seat, view, base, candidates, rng, {
    ...opts.search,
    rng,
    budgetMs: opts.budgetMs ?? ANALYSIS_DEFAULTS.budgetMs,
    samples: opts.samples ?? ANALYSIS_DEFAULTS.samples,
  }, true);
  if (!result) {
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
