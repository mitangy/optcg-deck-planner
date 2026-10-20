/**
 * Hard bot (#631): determinized lookahead over the generic engine, no per-card scripts.
 *
 * At a decision with two or more meaningful options the bot builds K determinized copies of the match (hidden cards
 * resampled, see determinize.ts), applies each candidate intent to each copy with the real `applyIntent`, plays the rest
 * of the turn out with the "normal" policy for both seats, scores the result (evaluate.ts) and keeps the candidate with
 * the best average score. The normal policy's own pick is always candidate 0 and wins ties and near-ties, so a noisy
 * or out-of-time search degrades to normal rather than to something worse.
 *
 * Anytime: candidates are evaluated in priority order on the first copy, the best few are re-checked on the other
 * copies, and the search stops as soon as the time budget is spent.
 */
import { applyIntent, getPlayerView } from "../engine.js";
import { createSeededRng, type Rng } from "../rng.js";
import type { Intent, MatchState, Seat } from "../types.js";
import { actingSeat } from "./acting.js";
import { determinize, type PriorChoice } from "./determinize.js";
import { DEFAULT_DECK_PRIOR } from "./defaultPrior.js";
import { evaluate } from "./evaluate.js";
import { evaluateLearned } from "./learnedEval.js";
import { chooseSimMulligan } from "./mulligan.js";
import { chooseBotIntent, MAX_INTENTS_PER_TURN, memoryFor, peekNormalIntent, recordMainPick, seedTurnMemory } from "./policy.js";
import type { TurnMemory } from "./main.js";
import type { BotOptions, BotView } from "./types.js";
import { boardValue, defValue, findBoardCard } from "./value.js";

export const HARD_DEFAULTS = {
  /** Wall-clock budget for one decision. */
  budgetMs: 200,
  /** Determinized copies of the hidden information. */
  samples: 3,
  /** A candidate must beat the normal policy's pick by this many "cards" (see evaluate.ts) to replace it. */
  margin: 0.2,
  /** The same, in log odds, when the learned score is used (#635). */
  marginLearned: 0.1,
  /**
   * Defaults of the #635 options (see BotOptions). The learned score stays off: in a paired batch of 160 games (equal evaluations per decision)
   * Hard with the learned score won 48% (95% CI 41-56%) against Hard with the hand-tuned score, so it was not kept as the default; it still
   * produces the win probabilities of position analysis.
   */
  evalMode: "hand" as "learned" | "hand",
  opponentModel: "normal" as "normal" | "greedy",
  mulligan: "sim" as "sim" | "rule",
  /** How many candidates are re-checked on the other copies. */
  finalists: 3,
  /** Candidate caps per kind, so a wide board does not turn into dozens of rollouts. */
  maxPlays: 6,
  maxAttacks: 6,
  maxGives: 2,
  maxCounters: 8,
  /** A rollout that has not finished after this many intents is cut where it stands. */
  maxRolloutSteps: 200,
} as const;

type Candidate = Intent;
const UNUSED_RNG = createSeededRng(1);
const keyOf = (i: Intent): string => JSON.stringify(i);
const now = (): number => performance.now();

// --- candidates ----------------------------------------------------------------------------------------------

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
  // select / order / look: the bot's own answer against the engine's default.
  return uniq(base, legal.slice(0, 1));
}

// --- rollout ---------------------------------------------------------------------------------------------------

interface Knobs {
  evalMode: "learned" | "hand";
  prior: PriorChoice;
  opponentModel: "normal" | "greedy";
  margin: number;
}

/** The learned score of a position for `seat`, as a win probability (a finished game is exactly 0 or 1). */
function winProb(state: MatchState, seat: Seat): number {
  if (state.winner !== null) return state.winner === seat ? 1 : 0;
  return 1 / (1 + Math.exp(-evaluateLearned(state, seat)));
}

/**
 * The opponent in a rollout when it is modelled as "greedy": normal's main-phase candidates are tried one move ahead and
 * scored with the learned model from the opponent's own side; normal's pick is kept unless another beats it by a margin.
 */
function greedyMainIntent(s: MatchState, actor: Seat, view: BotView, rng: Rng): Intent | null {
  const memory = memoryFor(rng, view);
  const base = peekNormalIntent(view, rng);
  if (!base) return null;
  let pick = base;
  if (base.type !== "give_don" && memory.count + 1 < MAX_INTENTS_PER_TURN) {
    const cands = mainCandidates(view, base, memory);
    if (cands.length > 1) {
      let best = -Infinity;
      let baseScore = -Infinity;
      cands.forEach((c, i) => {
        const r = applyIntent(s, c, { seat: actor, rng: UNUSED_RNG });
        if (!r.ok) return;
        const v = evaluateLearned(r.state, actor);
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

/** Play `state` forward until the turn counter reaches `endTurn`, someone wins, or the step cap. I play normal; the opponent plays normal or greedy. */
function rollout(state: MatchState, me: Seat, endTurn: number, seed: number, memory: TurnMemory | null, opponentModel: "normal" | "greedy"): MatchState {
  const rngs = [createSeededRng(seed), createSeededRng(seed + 1)] as const;
  let s = state;
  let seeded = memory === null;
  for (let steps = 0; s.winner === null && s.turnNumber < endTurn && steps < HARD_DEFAULTS.maxRolloutSteps; steps += 1) {
    const actor = actingSeat(s);
    const view = getPlayerView(s, actor);
    if (!view.legalIntents.length) break;
    // The real turn's record (abilities already used, intents so far) carries on into the rollout.
    if (!seeded && actor === me && view.phase === "main" && view.pendingChoices.length === 0) { seedTurnMemory(rngs[me], view, memory!); seeded = true; }
    const greedy = opponentModel === "greedy" && actor !== me && view.phase === "main" && view.pendingChoices.length === 0;
    const intent = greedy ? greedyMainIntent(s, actor, view, rngs[actor]) : chooseBotIntent(view, { level: "normal", rng: rngs[actor] });
    if (!intent) break;
    let r = applyIntent(s, intent, { seat: actor, rng: UNUSED_RNG });
    if (!r.ok) r = applyIntent(s, view.legalIntents[0]!, { seat: actor, rng: UNUSED_RNG });
    if (!r.ok) break;
    s = r.state;
  }
  return s;
}

interface Scored { score: number; prob: number }

function scoreCandidate(det: MatchState, seat: Seat, cand: Candidate, endTurn: number, seed: number, memory: TurnMemory | null, knobs: Knobs): Scored | null {
  try {
    const applied = applyIntent(det, cand, { seat, rng: UNUSED_RNG });
    if (!applied.ok) return null;
    const end = rollout(applied.state, seat, endTurn, seed, memory, knobs.opponentModel);
    return knobs.evalMode === "learned"
      ? { score: evaluateLearned(end, seat, det.turnNumber), prob: winProb(end, seat) }
      : { score: evaluate(end, seat, det.turnNumber), prob: winProb(end, seat) };
  } catch {
    return null;
  }
}

// --- the search --------------------------------------------------------------------------------------------------

/** Everything a finished search knows, for the bot's pick, tracing and position analysis. */
export interface SearchResult {
  candidates: Candidate[];
  /** scores[c][k] on the knobs' scale, null when not evaluated or rejected by the engine. */
  scores: (number | null)[][];
  /** probs[c][k]: win probability of the rollout's end position. */
  probs: (number | null)[][];
  /** Samples every candidate in `pool` was completed on. */
  rounds: number;
  /** Candidates that finished `rounds` samples. */
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
  };
}

/** The candidates the search looks at for this view, normal's pick first. `all` also searches a lone give_don and ignores the per-turn cap (position analysis). */
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

/**
 * Score every candidate of the decision on determinized copies of `state`, anytime within the budget. Returns null when
 * there is nothing to compare (fewer than two candidates). Does not record anything in the turn memory.
 */
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
    // Round 0: every candidate on the first copy, in priority order (normal's pick first).
    const evaluated: number[] = [];
    for (let c = 0; c < candidates.length; c += 1) {
      if (c > 0 && outOfTime()) break;
      evalOn(c, 0);
      evaluated.push(c);
    }
    const ok = evaluated.filter((c) => scores[c]![0] != null);
    pool = ok;

    // Later rounds: only the best few (and always normal's pick) on the remaining copies; a round counts only when complete.
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

/**
 * The intent the hard bot sends for `seat`, or null when it is not that seat's move. Never reads `state` outside what
 * `getPlayerView(state, seat)` shows, except through `determinize`, which resamples every hidden card.
 */
export function chooseHardIntent(state: MatchState, seat: Seat, opts: BotOptions = {}): Intent | null {
  const view = getPlayerView(state, seat);
  if (!view.legalIntents.length) return null;
  const rng: Rng = opts.rng ?? createSeededRng(0x0b07);
  const base = peekNormalIntent(view, rng);
  if (!base) return null;

  const inMain = view.pendingChoices.length === 0 && view.phase === "main";
  const memory = inMain ? memoryFor(rng, view) : null;
  const commit = (pick: Intent): Intent => {
    if (memory) { memory.count += 1; recordMainPick(view, rng, pick); }
    return pick;
  };

  if (view.phase === "mulligan" && view.pendingChoices.length === 0 && (opts.mulligan ?? HARD_DEFAULTS.mulligan) === "sim") {
    return chooseSimMulligan(state, seat, view, rng, base);
  }

  const candidates = candidatesFor(view, base, rng);
  const result = searchCandidates(state, seat, view, base, candidates, rng, opts);
  if (!result) return commit(base);
  opts.onTrace?.({ candidates, scores: result.scores, chosen: result.chosen });
  return commit(candidates[result.chosen]!);
}
