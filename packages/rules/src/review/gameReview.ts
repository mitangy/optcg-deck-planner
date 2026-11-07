/**
 * Chess.com-style game review of a recorded match (#967): at each decision with more than one legal intent the
 * bot analysis ranks the options, and the move that was played is graded against the best one.
 *
 * Meant to be imported on its own path (`@optcg/rules/review/gameReview`) by the app's lazy replay chunk or a Web Worker:
 * it imports the engine and the bot analysis only, never the simulator or test helpers.
 * The reviewer is incremental (`advance`) so a worker can post progress between slices.
 */
import { getPlayerView } from "../engine.js";
import { describeIntent } from "../bot/labels.js";
import { rankOptions, winProbability } from "../bot/analysis.js";
import { replayApply, replayStart, type MatchReplay } from "../replay/matchReplay.js";
import { createSeededRng } from "../rng.js";
import type { Intent, MatchState, Seat } from "../types.js";
import { MOVE_CLASSES, accuracyScore, classifyMove, isGoodTurn, stableJson, worseClass, type MoveClass } from "./classify.js";

export { MOVE_CLASSES, REVIEW_THRESHOLDS, accuracyScore, classifyLoss, classifyMove, isGoodTurn, worseClass, type MoveClass } from "./classify.js";
export type { MatchReplay } from "../replay/matchReplay.js";
export type { Intent, Seat } from "../types.js";

export interface ReviewOptions {
  /** Wall-clock budget per ranked decision (default 300). */
  budgetMs?: number;
  /** Determinized games per option (default 6). */
  samples?: number;
  /** Seats to review (default both). */
  seats?: Seat[];
}

export const REVIEW_DEFAULTS = { budgetMs: 300, samples: 6 } as const;

export interface ReviewedMove {
  /** The state before intent `step` is the position that was judged. */
  step: number;
  seat: Seat;
  turn: number;
  played: { intent: Intent; label: string };
  best: { intent: Intent; label: string };
  /** Win chances in percentage points (0..100). `played` is null when the played intent was not among the ranked options. */
  playedWin: number | null;
  bestWin: number;
  /** Best minus played, in points; null when the played move was not ranked. */
  loss: number | null;
  /** Null when the played move was not ranked. */
  cls: MoveClass | null;
  /** Accuracy score 0..100 (null when unranked). */
  score: number | null;
  /** How many options were ranked. */
  options: number;
}

/** Win probability of each seat (points, 0..100) at the start of a turn (and once more at the end of the game). */
export interface EvalPoint {
  step: number;
  turn: number;
  activeSeat: Seat;
  win: [number, number];
  /** The end of the replayable game rather than a turn start. */
  final?: boolean;
}

export interface TurnSummary {
  turn: number;
  seat: Seat;
  /** The seat was the active player this turn. */
  active: boolean;
  worstClass: MoveClass | null;
  /** Reviewed decisions by this seat during the turn (defensive ones included). */
  decisions: number;
  /** Win probability gain for the seat from this turn's start to the start of its next own turn (the end of the game for the last turn), in points. Null without a next point or when the seat was not active. */
  gain: number | null;
  goodTurn: boolean;
}

export interface SeatSummary {
  counts: Record<MoveClass, number>;
  /** Decisions that were ranked and graded. */
  graded: number;
  /** Decisions whose played move was not among the ranked options. */
  unranked: number;
  /** Mean of the decision scores, 0..100; null when nothing was graded. */
  accuracy: number | null;
}

export interface GameReview {
  moves: ReviewedMove[];
  evals: EvalPoint[];
  turns: TurnSummary[];
  seats: [SeatSummary, SeatSummary];
  /** Decisions with a single legal intent, not reviewed. */
  forced: number;
  /** Set when the engine refused a recorded intent; the review covers what came before. */
  diverged?: { atIntent: number; message: string };
}

const pct = (p: number) => p * 100;

function emptySeat(): SeatSummary {
  return { counts: Object.fromEntries(MOVE_CLASSES.map((c) => [c, 0])) as Record<MoveClass, number>, graded: 0, unranked: 0, accuracy: null };
}

/** A different deterministic stream for each step of each match. */
function stepSeed(replaySeed: number, step: number): number {
  return (Math.imul(replaySeed | 0, 1000003) + Math.imul(step + 1, 7919)) >>> 0;
}

export function createGameReviewer(replay: MatchReplay, opts: ReviewOptions = {}) {
  const budgetMs = opts.budgetMs ?? REVIEW_DEFAULTS.budgetMs;
  const samples = opts.samples ?? REVIEW_DEFAULTS.samples;
  const seats = new Set<Seat>(opts.seats ?? [0, 1]);
  let state: MatchState = replayStart(replay);
  const moves: ReviewedMove[] = [];
  const evals: EvalPoint[] = [];
  let forced = 0;
  let next = 0;
  let done = replay.intents.length === 0;
  let diverged: GameReview["diverged"];
  // Seat that made decisions in each turn, to build summaries.
  const turnDecisions = new Map<string, { worst: MoveClass | null; n: number }>();

  const pushEval = (final = false) =>
    evals.push({ step: next, turn: state.turnNumber, activeSeat: state.activeSeat, win: [pct(winProbability(state, 0)), pct(winProbability(state, 1))], ...(final ? { final: true } : {}) });
  pushEval();

  function review(i: number, seat: Seat, intent: Intent) {
    const before = state;
    if (!seats.has(seat) || getPlayerView(before, seat).legalIntents.length <= 1) {
      if (seats.has(seat)) forced++;
      return false;
    }
    const ranked = rankOptions(before, seat, { budgetMs, samples, include: [intent], rng: createSeededRng(stepSeed(replay.seed, i)) });
    if (!ranked.length) return false;
    const key = stableJson(intent);
    const at = ranked.findIndex((o) => stableJson(o.intent) === key);
    const best = ranked[0]!;
    let playedWin: number | null = null;
    let loss: number | null = null;
    let cls: MoveClass | null = null;
    let label = "";
    if (at >= 0) {
      const p = ranked[at]!;
      playedWin = pct(p.winChance);
      label = p.label;
      ({ loss, cls } = classifyMove(playedWin, ranked.filter((_, k) => k !== at).map((o) => pct(o.winChance))));
    } else {
      label = describeIntent(before, seat, intent);
    }
    moves.push({
      step: i, seat, turn: before.turnNumber,
      played: { intent, label }, best: { intent: best.intent, label: best.label },
      playedWin, bestWin: pct(best.winChance), loss, cls,
      score: loss === null ? null : accuracyScore(loss),
      options: ranked.length,
    });
    const k = `${before.turnNumber}:${seat}`;
    const t = turnDecisions.get(k) ?? { worst: null, n: 0 };
    t.worst = worseClass(t.worst, cls);
    t.n++;
    turnDecisions.set(k, t);
    return true;
  }

  return {
    /** Review up to `maxDecisions` more ranked decisions (forced and unreviewed-seat intents are free). True once finished. */
    advance(maxDecisions: number): boolean {
      let analyzed = 0;
      while (!done && analyzed < maxDecisions) {
        const i = next;
        const { seat, intent } = replay.intents[i]!;
        if (review(i, seat, intent)) analyzed++;
        try {
          const before = state;
          state = replayApply(state, replay, i).state;
          next = i + 1;
          if (state.turnNumber !== before.turnNumber) pushEval();
        } catch (err) {
          diverged = { atIntent: i, message: err instanceof Error ? err.message : String(err) };
          done = true;
          break;
        }
        if (next >= replay.intents.length) done = true;
      }
      if (done && !evals.some((e) => e.final)) pushEval(true);
      return done;
    },
    /** 0 to 1. */
    progress(): number {
      if (done) return 1;
      return replay.intents.length === 0 ? 1 : next / replay.intents.length;
    },
    result(): GameReview {
      const seatSums: [SeatSummary, SeatSummary] = [emptySeat(), emptySeat()];
      const scores: [number[], number[]] = [[], []];
      for (const m of moves) {
        const s = seatSums[m.seat];
        if (m.cls === null) { s.unranked++; continue; }
        s.counts[m.cls]++;
        s.graded++;
        scores[m.seat].push(m.score!);
      }
      for (const seat of [0, 1] as const) {
        const sc = scores[seat];
        seatSums[seat].accuracy = sc.length ? sc.reduce((a, b) => a + b, 0) / sc.length : null;
      }
      const turns: TurnSummary[] = [];
      const seen = new Set<string>();
      evals.forEach((e, idx) => {
        // Turn 0 is the mulligan phase before the first turn (the start point is kept for the win chance): not a turn to summarise (#986).
        if (e.final || e.turn < 1) return;
        // The seat's own next turn start (or the end of the game), so both points have the move.
        const nextPoint = evals.slice(idx + 1).find((p) => p.final || p.activeSeat === e.activeSeat);
        const k = `${e.turn}:${e.activeSeat}`;
        seen.add(k);
        const td = turnDecisions.get(k);
        const gain = nextPoint ? nextPoint.win[e.activeSeat] - e.win[e.activeSeat] : null;
        turns.push({
          turn: e.turn, seat: e.activeSeat, active: true,
          worstClass: td?.worst ?? null, decisions: td?.n ?? 0, gain,
          goodTurn: gain !== null && isGoodTurn(td?.worst ?? null, e.win[e.activeSeat], nextPoint!.win[e.activeSeat]),
        });
      });
      for (const [k, td] of turnDecisions) {
        if (seen.has(k)) continue;
        const [turn, seat] = k.split(":").map(Number) as [number, Seat];
        turns.push({ turn, seat, active: false, worstClass: td.worst, decisions: td.n, gain: null, goodTurn: false });
      }
      turns.sort((a, b) => a.turn - b.turn || a.seat - b.seat);
      return { moves: [...moves], evals: [...evals], turns, seats: seatSums, forced, ...(diverged ? { diverged } : {}) };
    },
  };
}

/** Review the whole game at once (tests, tools). */
export function reviewGame(replay: MatchReplay, opts: ReviewOptions = {}): GameReview {
  const r = createGameReviewer(replay, opts);
  r.advance(Number.MAX_SAFE_INTEGER);
  return r.result();
}
