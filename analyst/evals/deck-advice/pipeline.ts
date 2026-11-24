import type { BotLevel } from "@optcg/rules";
import type { CallModel, Usage } from "../../src/chat";
import { askLogPose, type AskDeps } from "./ask";
import type { AdviceCase } from "./cases";
import { applyAdvice, editLines, extractAdviceEdits, scoreRemoval, type AdviceEdits } from "./edits";
import type { Copies, MetaDeck } from "./sabotage";
import { compareSims, simulate, type SimDeck, type SimResult, type SimRun, type WinRateChange } from "./sim";

export type SimConfig = {
  field: readonly MetaDeck[];
  games: number;
  seed: number;
  levels: [BotLevel, BotLevel];
  run: SimRun;
  cache: Map<string, Promise<SimResult>>;
};

export type SimRow = {
  opponents: number;
  games_per_opponent: number;
  levels: [BotLevel, BotLevel];
  before: SimResult;
  after: SimResult | null;
  change: Omit<WinRateChange, "before" | "after"> | null;
  ceiling: SimResult | null;
  vs_ceiling: Omit<WinRateChange, "before" | "after"> | null;
};

export type AnswerRow = {
  case: string;
  kind: AdviceCase["kind"];
  leader: string;
  k: number | null;
  model: string | undefined;
  answer: string;
  shown: string;
  edit_source: AdviceEdits["source"];
  edits: AdviceEdits["deltas"];
  legal: boolean;
  problems: string[];
  added: number;
  removed: number;
  planted: number;
  planted_removed: number;
  recall: number | null;
  precision: number | null;
  sim: SimRow | null;
  tool_calls: string[];
  rounds: number;
  usage: Usage;
  cost_usd: number;
  out_of_rounds: boolean;
};

export type PipelineDeps = {
  ask: AskDeps;
  base: CallModel;
  extraProblems?: Parameters<typeof applyAdvice>[4];
  sim: SimConfig | null;
};

const expand = (leaderId: string, cards: readonly Copies[]): SimDeck => ({ leaderId, deck: cards.flatMap((c) => Array.from({ length: c.copies }, () => c.id)) });
const signature = (d: SimDeck) => `${d.leaderId}:${[...d.deck].sort().join(",")}`;

export function simDeck(cfg: SimConfig, c: Pick<AdviceCase, "source" | "leaderId">, cards: readonly Copies[]): Promise<SimResult> {
  const mine = expand(c.leaderId, cards);
  const field = cfg.field.filter((_, i) => i !== c.source).map((d) => ({ leaderId: d.leaderId, deck: d.deck }));
  const key = [signature(mine), field.map(signature).join("|"), cfg.games, cfg.seed, cfg.levels.join("-")].join("#");
  let hit = cfg.cache.get(key);
  if (!hit) {
    hit = simulate(mine, field, { games: cfg.games, seed: cfg.seed, levels: cfg.levels }, cfg.run);
    cfg.cache.set(key, hit);
  }
  return hit;
}

export async function simulateCase(cfg: SimConfig, c: AdviceCase, edited: readonly Copies[] | null): Promise<SimRow> {
  const [before, after, ceiling] = await Promise.all([
    simDeck(cfg, c, c.cards),
    edited ? simDeck(cfg, c, edited) : Promise.resolve(null),
    c.kind === "sabotaged" ? simDeck(cfg, c, c.original) : Promise.resolve(null),
  ]);
  const strip = ({ diff, lo, hi }: WinRateChange) => ({ diff, lo, hi });
  return {
    opponents: cfg.field.length - 1,
    games_per_opponent: cfg.games,
    levels: cfg.levels,
    before,
    after,
    change: after ? strip(compareSims(before, after)) : null,
    ceiling,
    vs_ceiling: after && ceiling ? strip(compareSims(ceiling, after)) : null,
  };
}

export async function evaluateCase(deps: PipelineDeps, c: AdviceCase): Promise<AnswerRow> {
  const asked = await askLogPose(deps.ask, c, deps.base);
  const edits = extractAdviceEdits(asked.proposals, asked.answer);
  const applied = applyAdvice(deps.ask.catalog, c.leaderId, c.cards, edits, deps.extraProblems);
  const score = scoreRemoval(c.planted, c.cards, applied.cards);
  const usable = edits.deltas.length > 0 && applied.legal;
  const lines = editLines(deps.ask.catalog, edits.deltas);
  return {
    case: c.id,
    kind: c.kind,
    leader: c.leaderId,
    k: c.k,
    model: asked.model,
    answer: asked.answer,
    shown: lines.length ? `${asked.answer}\n\nSuggested changes:\n${lines.join("\n")}` : asked.answer,
    edit_source: edits.source,
    edits: edits.deltas,
    legal: applied.legal,
    problems: applied.problems,
    added: applied.added,
    removed: applied.removed,
    planted: score.planted,
    planted_removed: score.plantedRemoved,
    recall: score.recall,
    precision: score.precision,
    sim: deps.sim ? await simulateCase(deps.sim, c, usable ? applied.cards : null) : null,
    tool_calls: asked.toolCalls,
    rounds: asked.rounds,
    usage: asked.usage,
    cost_usd: asked.costUsd,
    out_of_rounds: asked.outOfRounds,
  };
}

