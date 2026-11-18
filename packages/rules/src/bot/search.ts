/**
 * The normal policy's own pick is candidate 0 and wins ties and near-ties, so a noisy or out-of-time search degrades
 * to normal rather than to something worse.
 */
import { applyIntent, getPlayerView } from "../engine.js";
import { createSeededRng, type Rng } from "../rng.js";
import type { Intent, MatchState, Seat } from "../types.js";
import { actingSeat } from "./acting.js";
import { determinize, type PriorChoice } from "./determinize.js";
import { DEFAULT_DECK_PRIOR } from "./defaultPrior.js";
import { evaluate } from "./evaluate.js";
import { evaluateLearned } from "./learnedEval.js";
import { VALUE_WEIGHTS, type ValueModel } from "./valueModel.js";
import { playbookFor, type PlaybookSetting } from "./playbooks/index.js";
import { rankedEligible } from "./choices.js";
import { chooseSimMulligan } from "./mulligan.js";
import { chooseBotIntent, MAX_INTENTS_PER_TURN, memoryFor, peekNormalIntent, recordMainPick, seedTurnMemory } from "./policy.js";
import type { TurnMemory } from "./main.js";
import type { BotOptions, BotView } from "./types.js";
import { boardValue, defValue, findBoardCard } from "./value.js";

export const HARD_DEFAULTS = {
  budgetMs: 200,
  samples: 3,
  margin: 0.2,
  marginLearned: 0.1,
  /**
   * The learned score is the default since the v2 MLP: in paired self-play (1000 games) Hard with it won 54.6% (95% CI
   * 52-58%) against the hand-tuned score, confirmed at 54.7% (52-58%) on fresh deals. The earlier linear v1 model only
   * reached 48.1% (45-51%).
   */
  evalMode: "learned" as "learned" | "hand",
  opponentModel: "normal" as "normal" | "greedy",
  mulligan: "sim" as "sim" | "rule",
  finalists: 3,
  /** Caps per kind so a wide board does not turn into dozens of rollouts. */
  maxPlays: 6,
  maxAttacks: 6,
  maxGives: 2,
  maxCounters: 8,
  maxChoiceTargets: 8,
  maxRolloutSteps: 200,
} as const;

type Candidate = Intent;
const keyOf = (i: Intent): string => JSON.stringify(i);
const now = (): number => performance.now();

function uniq(base: Intent, rest: Intent[]): Candidate[] {
  const seen = new Set([keyOf(base)]);
  const out: Candidate[] = [base];
  for (const i of rest) {
    const k = keyOf(i);
    if (!seen.has(k)) { seen.add(k); out.push(i); }
  }
  return out;
}

export function mainCandidates(view: BotView, base: Intent, memory: TurnMemory): Candidate[] {
  const legal = view.legalIntents;
  const D = HARD_DEFAULTS;
  const rest: Intent[] = [];
  for (const i of legal) if (i.type === "activate_ability" && !memory.activated.has(`${i.sourceId}:${i.abilityId}`)) rest.push(i);

  const seenPlay = new Set<string>();
  const plays = legal
    .filter((i): i is Extract<Intent, { type: "play_card" }> => i.type === "play_card")
    .filter((i) => {
      // Two copies of one card in hand are the same play.
      const k = `${view.you.hand[i.handIndex]?.defId}:${i.trashCharacterId ?? ""}`;
      if (seenPlay.has(k)) return false;
      seenPlay.add(k);
      return true;
    })
    .sort((a, b) => defValue(view.you.hand[b.handIndex]?.defId) - defValue(view.you.hand[a.handIndex]?.defId));
  rest.push(...plays.slice(0, D.maxPlays));

  const attackers = (id: string) => findBoardCard(view, id)?.card;
  const attacks = legal
    .filter((i): i is Extract<Intent, { type: "declare_attack" }> => i.type === "declare_attack")
    .map((a) => {
      const atk = attackers(a.attackerId);
      const target = a.target.kind === "leader" ? view.opponent.leader : view.opponent.characters.find((c) => c.id === (a.target as { instanceId: string }).instanceId);
      return { a, atk, target };
    })
    // An attack that cannot connect only costs the attacker its untap.
    .filter((x) => x.atk && x.target && x.atk.power >= x.target.power)
    .sort((x, y) => (y.target === view.opponent.leader ? 100 : boardValue(y.target!)) - (x.target === view.opponent.leader ? 100 : boardValue(x.target!)));
  rest.push(...attacks.slice(0, D.maxAttacks).map((x) => x.a));

  // DON!! only matters when something can attack with it: one give per target.
  if (attacks.length) {
    const seenTarget = new Set<string>();
    const gives = legal.filter((i): i is Extract<Intent, { type: "give_don" }> => i.type === "give_don").filter((g) => (seenTarget.has(g.targetId) ? false : (seenTarget.add(g.targetId), true)));
    rest.push(...gives.slice(0, D.maxGives));
  }
  const end = legal.find((i) => i.type === "end_turn");
  if (end) rest.push(end);
  return uniq(base, rest);
}

export function defenseCandidates(view: BotView, base: Intent): Candidate[] {
  const seen = new Set<string>();
  const rest: Intent[] = [];
  for (const i of view.legalIntents) {
    if (i.type === "counter_from_hand" || i.type === "counter_event") {
      const k = `${i.type}:${view.you.hand[i.handIndex]?.defId}`;
      if (seen.has(k)) continue;
      seen.add(k);
    }
    rest.push(i);
  }
  // Passing is always on the list; the cap keeps the cheapest-looking counters.
  const counters = rest.filter((i) => i.type === "counter_from_hand" || i.type === "counter_event");
  const others = rest.filter((i) => i.type !== "counter_from_hand" && i.type !== "counter_event");
  return uniq(base, [...others, ...counters.slice(0, HARD_DEFAULTS.maxCounters)]);
}

export function choiceCandidates(view: BotView, base: Intent): Candidate[] {
  const choice = view.pendingChoices[0];
  if (!choice || choice.seat !== view.seat || choice.kind === "order_effects" || choice.unpayable) return [base];
  const legal = view.legalIntents.filter((i) => i.type === "resolve_pending_choice");
  const r = choice.request;
  if (choice.kind === "life_trigger" || !r || r.type === "confirm") return uniq(base, legal);
  if (r.type === "mode") {
    return uniq(base, r.options.filter((o) => o.eligible).map((o): Intent => ({ type: "resolve_pending_choice", accept: true, selectedOptionIds: [o.id] })));
  }
  const pick = (ids: string[]): Intent => ({ type: "resolve_pending_choice", accept: true, selectedOptionIds: ids });
  const extra: Intent[] = [];
  if (r.type === "select") {
    const ranked = rankedEligible(view, r.options);
    if (r.min <= 1 && 1 <= r.max) extra.push(...ranked.map((o) => pick([o.id])));
    if (r.min === 0) extra.push(pick([]));
    const picked = base.type === "resolve_pending_choice" && base.selectedOptionIds && base.selectedOptionIds.length > 1 ? base.selectedOptionIds : null;
    if (picked) for (const o of ranked) if (!picked.includes(o.id)) for (const out of picked) extra.push(pick(picked.map((id) => (id === out ? o.id : id))));
  } else if (r.type === "look" && base.type === "resolve_pending_choice" && base.selectedOptionIds) {
    const order = [...base.selectedOptionIds, ...(base.orderedOptionIds ?? [])];
    const fits = new Set(r.groups.flatMap((g) => g.eligibleIds));
    const ranked = rankedEligible(view, r.options).filter((o) => fits.has(o.id));
    const variant = (ids: string[]): Intent => {
      const rest = order.filter((id) => !ids.includes(id));
      return { ...base, selectedOptionIds: ids, orderedOptionIds: rest, ...(base.topOptionIds ? { topOptionIds: base.topOptionIds.length ? rest : [] } : {}) };
    };
    if (r.minSelect <= 1 && 1 <= r.maxSelect) extra.push(...ranked.map((o) => variant([o.id])));
    if (r.minSelect === 0) extra.push(variant([]));
  }
  const have = new Set([base, ...legal.slice(0, 1)].map(keyOf));
  return uniq(base, [...legal.slice(0, 1), ...uniq(base, extra).filter((i) => !have.has(keyOf(i))).slice(0, HARD_DEFAULTS.maxChoiceTargets)]);
}

interface Knobs {
  evalMode: "learned" | "hand";
  prior: PriorChoice;
  opponentModel: "normal" | "greedy";
  margin: number;
  valueWeights: ValueModel;
  playbooks: PlaybookSetting;
}

function winProb(state: MatchState, seat: Seat, w: ValueModel): number {
  if (state.winner !== null) return state.winner === seat ? 1 : 0;
  return 1 / (1 + Math.exp(-evaluateLearned(state, seat, state.turnNumber, w)));
}

function greedyMainIntent(s: MatchState, actor: Seat, view: BotView, rng: Rng, w: ValueModel, playbooks: PlaybookSetting): Intent | null {
  const memory = memoryFor(rng, view);
  const base = peekNormalIntent(view, rng, playbooks);
  if (!base) return null;
  let pick = base;
  if (base.type !== "give_don" && memory.count + 1 < MAX_INTENTS_PER_TURN) {
    const cands = mainCandidates(view, base, memory);
    if (cands.length > 1) {
      let best = -Infinity;
      let baseScore = -Infinity;
      cands.forEach((c, i) => {
        const r = applyIntent(s, c, { seat: actor });
        if (!r.ok) return;
        const v = evaluateLearned(r.state, actor, r.state.turnNumber, w);
        if (i === 0) baseScore = v;
        if (v > best) { best = v; pick = c; }
      });
      if (!(best > baseScore + HARD_DEFAULTS.marginLearned)) pick = base;
    }
  }
  memory.count += 1;
  recordMainPick(view, rng, pick);
  return pick;
}

function rollout(state: MatchState, me: Seat, endTurn: number, seed: number, memory: TurnMemory | null, opponentModel: "normal" | "greedy", weights: ValueModel = VALUE_WEIGHTS, playbooks: PlaybookSetting = true): MatchState {
  const rngs = [createSeededRng(seed), createSeededRng(seed + 1)] as const;
  let s = state;
  let seeded = memory === null;
  for (let steps = 0; s.winner === null && s.turnNumber < endTurn && steps < HARD_DEFAULTS.maxRolloutSteps; steps += 1) {
    const actor = actingSeat(s);
    const view = getPlayerView(s, actor);
    if (!view.legalIntents.length) break;
    if (!seeded && actor === me && view.phase === "main" && view.pendingChoices.length === 0) { seedTurnMemory(rngs[me], view, memory!); seeded = true; }
    const greedy = opponentModel === "greedy" && actor !== me && view.phase === "main" && view.pendingChoices.length === 0;
    const intent = greedy ? greedyMainIntent(s, actor, view, rngs[actor], weights, playbooks) : chooseBotIntent(view, { level: "normal", rng: rngs[actor], playbooks });
    if (!intent) break;
    let r = applyIntent(s, intent, { seat: actor });
    if (!r.ok) r = applyIntent(s, view.legalIntents[0]!, { seat: actor });
    if (!r.ok) break;
    s = r.state;
  }
  return s;
}

interface Scored { score: number; prob: number }

function scoreCandidate(det: MatchState, seat: Seat, cand: Candidate, endTurn: number, seed: number, memory: TurnMemory | null, knobs: Knobs): Scored | null {
  try {
    const applied = applyIntent(det, cand, { seat });
    if (!applied.ok) return null;
    const end = rollout(applied.state, seat, endTurn, seed, memory, knobs.opponentModel, knobs.valueWeights, knobs.playbooks);
    return knobs.evalMode === "learned"
      ? { score: evaluateLearned(end, seat, det.turnNumber, knobs.valueWeights), prob: winProb(end, seat, knobs.valueWeights) }
      : { score: evaluate(end, seat, det.turnNumber), prob: winProb(end, seat, knobs.valueWeights) };
  } catch {
    return null;
  }
}

export interface SearchResult {
  candidates: Candidate[];
  scores: (number | null)[][];
  probs: (number | null)[][];
  rounds: number;
  pool: number[];
  chosen: number;
  evals: number;
}

function knobsFrom(opts: BotOptions): Knobs {
  const evalMode = opts.evalMode ?? HARD_DEFAULTS.evalMode;
  return {
    evalMode,
    prior: opts.prior ?? DEFAULT_DECK_PRIOR,
    opponentModel: opts.opponentModel ?? HARD_DEFAULTS.opponentModel,
    margin: evalMode === "learned" ? HARD_DEFAULTS.marginLearned : HARD_DEFAULTS.margin,
    valueWeights: opts.valueWeights ?? VALUE_WEIGHTS,
    playbooks: opts.playbooks ?? true,
  };
}

export function candidatesFor(view: BotView, base: Intent, rng: Rng, all = false): Candidate[] {
  const inMain = view.pendingChoices.length === 0 && view.phase === "main";
  if (view.pendingChoices.length > 0) return choiceCandidates(view, base);
  if (view.phase === "block" || view.phase === "counter") return defenseCandidates(view, base);
  if (view.phase === "mulligan") return uniq(base, view.legalIntents.filter((i) => i.type === "mulligan"));
  if (inMain) {
    const memory = memoryFor(rng, view);
    if (all || (base.type !== "give_don" && memory.count + 1 < MAX_INTENTS_PER_TURN)) return mainCandidates(view, base, memory);
  }
  return [base];
}

export function searchCandidates(state: MatchState, seat: Seat, view: BotView, base: Intent, candidates: Candidate[], rng: Rng, opts: BotOptions, exhaustive = false): SearchResult | null {
  if (candidates.length < 2) return null;
  const knobs = knobsFrom(opts);
  // The turn's record so far (abilities used, intents sent) also feeds the rollouts of a decision inside my own turn.
  const turnMemory = view.activeSeat === seat ? memoryFor(rng, view) : null;
  const D = HARD_DEFAULTS;
  const budget = opts.budgetMs ?? D.budgetMs;
  const samples = Math.max(1, Math.floor(opts.samples ?? D.samples));
  const horizon = opts.horizonTurns ?? 1;
  const startedAt = now();
  const maxEvals = opts.maxEvals ?? Infinity;
  let evals = 0;
  const outOfTime = (): boolean => evals >= maxEvals || now() - startedAt >= budget;
  const endTurn = state.turnNumber + horizon;
  const decisionSeed = rng.nextInt(0x3fffffff);
  const dets: MatchState[] = [];
  const detFor = (k: number): MatchState => (dets[k] ??= determinize(state, seat, createSeededRng(decisionSeed + 7919 * k), knobs.prior));

  const scores: (number | null)[][] = candidates.map(() => []);
  const probs: (number | null)[][] = candidates.map(() => []);
  const evalOn = (c: number, k: number): void => {
    evals += 1;
    const r = scoreCandidate(detFor(k), seat, candidates[c]!, endTurn, decisionSeed + 31 * k + 1, turnMemory, knobs);
    scores[c]![k] = r ? r.score : null;
    probs[c]![k] = r ? r.prob : null;
  };

  let chosen = 0;
  let pool: number[] = [];
  let rounds = 1;
  if (!outOfTime()) {
    const evaluated: number[] = [];
    for (let c = 0; c < candidates.length; c += 1) {
      if (c > 0 && outOfTime()) break;
      evalOn(c, 0);
      evaluated.push(c);
    }
    const ok = evaluated.filter((c) => scores[c]![0] != null);
    pool = ok;

    if (samples > 1 && ok.length > 1) {
      const top = [...ok].sort((a, b) => scores[b]![0]! - scores[a]![0]!).slice(0, exhaustive ? ok.length : D.finalists);
      const finalists = exhaustive || top.includes(0) || scores[0]![0] == null ? top : [0, ...top.slice(0, D.finalists - 1)];
      for (let k = 1; k < samples && !outOfTime(); k += 1) {
        let complete = true;
        for (const c of finalists) {
          if (outOfTime()) { complete = false; break; }
          evalOn(c, k);
        }
        if (!complete) break;
        rounds = k + 1;
        pool = finalists.filter((c) => scores[c]!.slice(0, rounds).every((v) => v != null));
      }
    }

    const mean = (c: number): number => scores[c]!.slice(0, rounds).reduce<number>((n, v) => n + (v ?? 0), 0) / rounds;
    if (pool.includes(0)) {
      let best = 0;
      for (const c of pool) if (mean(c) > mean(best)) best = c;
      if (best !== 0 && mean(best) > mean(0) + knobs.margin) chosen = best;
    } else if (pool.length > 0) {
      // Normal's own pick was rejected by the engine (a bot-built choice answer can break a rule only the engine knows): take the best that works.
      chosen = pool.reduce((best, c) => (mean(c) > mean(best) ? c : best), pool[0]!);
    }
  }
  return { candidates, scores, probs, rounds, pool, chosen, evals };
}

export function chooseHardIntent(state: MatchState, seat: Seat, opts: BotOptions = {}): Intent | null {
  const view = getPlayerView(state, seat);
  if (!view.legalIntents.length) return null;
  const rng: Rng = opts.rng ?? createSeededRng(0x0b07);
  const base = peekNormalIntent(view, rng, opts.playbooks ?? true);
  if (!base) return null;

  const inMain = view.pendingChoices.length === 0 && view.phase === "main";
  const memory = inMain ? memoryFor(rng, view) : null;
  const commit = (pick: Intent): Intent => {
    if (memory) { memory.count += 1; recordMainPick(view, rng, pick); }
    return pick;
  };

  if (view.phase === "mulligan" && view.pendingChoices.length === 0 && (opts.mulligan ?? HARD_DEFAULTS.mulligan) === "sim") {
    return chooseSimMulligan(state, seat, view, rng, base, playbookFor(view, opts.playbooks ?? true));
  }

  const candidates = candidatesFor(view, base, rng);
  const result = searchCandidates(state, seat, view, base, candidates, rng, opts);
  if (!result) return commit(base);
  opts.onTrace?.({ candidates, scores: result.scores, chosen: result.chosen });
  return commit(candidates[result.chosen]!);
}
