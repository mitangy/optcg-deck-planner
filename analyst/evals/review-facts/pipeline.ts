/**
 * One review through the whole eval (#675): the production review request, the model's text, the extracted
 * claims and a verdict for each. The model, extractor and cost all come in as arguments so tests and the dry run
 * use scripted ones.
 */
import type { MatchReplay, Seat } from "@optcg/rules";
import type { Catalog } from "../../src/catalog";
import { costUsd, flattenCited, reviewRequest, REVIEW_MAX_LINES, type CallModel, type Usage } from "../../src/chat";
import { reviewGame } from "../../src/matches";
import { withRetry } from "../retry";
import { checkClaim, type Verdict } from "./check";
import { guardQuotes, type Claim, type Extractor } from "./extract";
import { actorOf, gameFacts, type GameFacts } from "./facts";

export type ReviewRow = {
  id: string;
  seed: number;
  seat: Seat;
  leaders: [string, string];
  winner: Seat | null;
  model: string;
  review: string;
  review_cost_usd: number;
  extract_cost_usd: number;
  usage: Usage;
  claims: number;
  dropped: number;
  invalid: number;
  supported: number;
  contradicted: number;
  wrong_turn: number;
  unverifiable: number;
};

export type ClaimRow = Claim & { review: string; verdict: Verdict; reason: string };

export type PipelineDeps = { catalog: Catalog; model: string; callModel: CallModel; extractor: Extractor; retryMs?: number };

export async function evaluateReview(deps: PipelineDeps, input: { id: string; replay: MatchReplay; seat: Seat; facts?: GameFacts }): Promise<{ row: ReviewRow; claims: ClaimRow[] }> {
  const { replay, seat } = input;
  const facts = input.facts ?? gameFacts(replay);
  const game = reviewGame(input.id, replay, seat, { maxLines: REVIEW_MAX_LINES });
  const params = reviewRequest(deps.catalog, deps.model, game);
  const reply = await withRetry(() => deps.callModel(params as unknown as Record<string, unknown>, () => undefined, new AbortController().signal), { baseMs: deps.retryMs });
  const review = flattenCited(reply.content).text;
  const reviewCost = costUsd(reply.usage, reply.model ?? deps.model);
  const extracted = await deps.extractor(review);
  const { kept, dropped } = guardQuotes(review, extracted.claims);
  const claims: ClaimRow[] = kept.map((c) => ({ ...c, review: input.id, ...checkClaim(c, facts, seat, deps.catalog) }));
  const count = (v: Verdict) => claims.filter((c) => c.verdict === v).length;
  const row: ReviewRow = {
    id: input.id,
    seed: replay.seed,
    seat,
    leaders: facts.leaders,
    winner: facts.result.winner,
    model: reply.model ?? deps.model,
    review,
    review_cost_usd: reviewCost,
    extract_cost_usd: extracted.costUsd,
    usage: reply.usage,
    claims: claims.length,
    dropped: dropped.length,
    invalid: extracted.invalid,
    supported: count("supported"),
    contradicted: count("contradicted"),
    wrong_turn: count("wrong_turn"),
    unverifiable: count("unverifiable"),
  };
  return { row, claims };
}

/**
 * The dry run's review: template sentences built from the facts, some true and, when `wrong` is set, one false
 * result claim and one shifted turn, so the report has something to show. It is not a model.
 */
export function scriptedReview(facts: GameFacts, seat: Seat, wrong: boolean): string {
  const you = (s: Seat) => (actorOf(s, seat) === "you" ? "you" : "the opponent");
  const lines: string[] = [`${actorOf(facts.firstSeat, seat) === "you" ? "You" : "The opponent"} went first.`];
  const plays = facts.turns.flatMap((t) => t.plays.map((p) => ({ turn: t.turn, ...p }))).slice(0, 3);
  plays.forEach((p, i) => lines.push(`On turn ${p.turn + (wrong && i === 0 ? 2 : 0)}, ${you(p.seat)} played ${p.name}.`));
  const attack = facts.turns.flatMap((t) => t.attacks.map((a) => ({ turn: t.turn, ...a })))[0];
  if (attack) lines.push(`On turn ${attack.turn}, ${you(attack.seat)} attacked with ${attack.attackerName} into ${attack.target === "leader" ? "the Leader" : attack.targetName}.`);
  const last = facts.turns[facts.turns.length - 1];
  if (last) lines.push(`On turn ${last.turn}, you ended on ${last.lifeAtEnd[seat]} Life.`);
  lines.push("You should have held back more blockers.");
  const winner = facts.result.winner;
  if (winner !== null) lines.push(`${(wrong ? 1 - winner : winner) === seat ? "You" : "The opponent"} won the game.`);
  return lines.join("\n");
}
