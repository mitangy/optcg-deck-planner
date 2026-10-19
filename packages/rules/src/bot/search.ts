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
import { determinize } from "./determinize.js";
import { evaluate } from "./evaluate.js";
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

function mainCandidates(view: BotView, base: Intent, memory: TurnMemory): Candidate[] {
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

function defenseCandidates(view: BotView, base: Intent): Candidate[] {
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

function choiceCandidates(view: BotView, base: Intent): Candidate[] {
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

/** Play `state` forward with the normal policy for both seats until the turn counter reaches `endTurn`, someone wins, or the step cap. */
function rollout(state: MatchState, me: Seat, endTurn: number, seed: number, memory: TurnMemory | null): MatchState {
  const rngs = [createSeededRng(seed), createSeededRng(seed + 1)] as const;
  let s = state;
  let seeded = memory === null;
  for (let steps = 0; s.winner === null && s.turnNumber < endTurn && steps < HARD_DEFAULTS.maxRolloutSteps; steps += 1) {
    const actor = actingSeat(s);
    const view = getPlayerView(s, actor);
    if (!view.legalIntents.length) break;
    // The real turn's record (abilities already used, intents so far) carries on into the rollout.
    if (!seeded && actor === me && view.phase === "main" && view.pendingChoices.length === 0) { seedTurnMemory(rngs[me], view, memory!); seeded = true; }
    const intent = chooseBotIntent(view, { level: "normal", rng: rngs[actor] });
    if (!intent) break;
    let r = applyIntent(s, intent, { seat: actor, rng: UNUSED_RNG });
    if (!r.ok) r = applyIntent(s, view.legalIntents[0]!, { seat: actor, rng: UNUSED_RNG });
    if (!r.ok) break;
    s = r.state;
  }
  return s;
}

function scoreCandidate(det: MatchState, seat: Seat, cand: Candidate, endTurn: number, seed: number, memory: TurnMemory | null): number | null {
  try {
    const applied = applyIntent(det, cand, { seat, rng: UNUSED_RNG });
    if (!applied.ok) return null;
    const end = rollout(applied.state, seat, endTurn, seed, memory);
    return evaluate(end, seat, det.turnNumber);
  } catch {
    return null;
  }
}

// --- the search --------------------------------------------------------------------------------------------------

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
  // The turn's record so far (abilities used, intents sent) also feeds the rollouts of a decision inside my own turn.
  const turnMemory = view.activeSeat === seat ? memoryFor(rng, view) : null;
  const commit = (pick: Intent): Intent => {
    if (memory) { memory.count += 1; recordMainPick(view, rng, pick); }
    return pick;
  };

  let candidates: Candidate[];
  if (view.pendingChoices.length > 0) candidates = choiceCandidates(view, base);
  else if (view.phase === "block" || view.phase === "counter") candidates = defenseCandidates(view, base);
  else if (inMain && base.type !== "give_don" && memory!.count + 1 < MAX_INTENTS_PER_TURN) candidates = mainCandidates(view, base, memory!);
  else candidates = [base];
  if (candidates.length < 2) return commit(base);

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
  const detFor = (k: number): MatchState => (dets[k] ??= determinize(state, seat, createSeededRng(decisionSeed + 7919 * k)));

  const scores: (number | null)[][] = candidates.map(() => []);
  const evalOn = (c: number, k: number): void => {
    evals += 1;
    scores[c]![k] = scoreCandidate(detFor(k), seat, candidates[c]!, endTurn, decisionSeed + 31 * k + 1, turnMemory);
  };

  if (outOfTime()) return commit(base);

  // Round 0: every candidate on the first copy, in priority order (normal's pick first).
  const evaluated: number[] = [];
  for (let c = 0; c < candidates.length; c += 1) {
    if (c > 0 && outOfTime()) break;
    evalOn(c, 0);
    evaluated.push(c);
  }
  const ok = evaluated.filter((c) => scores[c]![0] != null);
  let pool = ok;
  let rounds = 1;

  // Later rounds: only the best few (and always normal's pick) on the remaining copies; a round counts only when complete.
  if (samples > 1 && ok.length > 1) {
    const top = [...ok].sort((a, b) => scores[b]![0]! - scores[a]![0]!).slice(0, D.finalists);
    const finalists = top.includes(0) || scores[0]![0] == null ? top : [0, ...top.slice(0, D.finalists - 1)];
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
  let chosen = 0;
  if (pool.includes(0)) {
    let best = 0;
    for (const c of pool) if (mean(c) > mean(best)) best = c;
    if (best !== 0 && mean(best) > mean(0) + D.margin) chosen = best;
  } else if (pool.length > 0) {
    // Normal's own pick was rejected by the engine (a bot-built choice answer can break a rule only the engine knows): take the best that works.
    chosen = pool.reduce((best, c) => (mean(c) > mean(best) ? c : best), pool[0]!);
  }
  opts.onTrace?.({ candidates, scores, chosen });
  return commit(candidates[chosen]!);
}
