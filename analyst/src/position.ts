/**
 * "What should I have done there?" (#635): rebuild a recorded game's position at a turn and ask the
 * bot analysis (rankOptions / winProbability from the rules engine) how the seat's options compare.
 *
 * The estimates are bot-simulation numbers, not results and not player statistics. The analysis only searches
 * determinized copies of the position, so it works from what the seat could see; and it is offered for finished
 * games only, where the replay's hidden cards are no longer secret.
 */
import { rankOptions, replayApply, replayStart, winProbability, type Intent, type MatchReplay, type MatchState, type PositionOption, type Seat } from "@optcg/rules";
import { PlannerApiError, plannerCall, isBotGameId, type PlannerApi } from "./matches";

export type PositionRequest = {
  seat: Seat;
  turn: number;
  /** Which of the seat's decisions in that turn (0 = the first). */
  step?: number;
  /** How many options to report (default 5). */
  top?: number;
  budgetMs?: number;
};

export const DEFAULT_BUDGET_MS = 1500;
export const MAX_BUDGET_MS = 5000;

const pct = (p: number) => Math.round(p * 100);

/** JSON with sorted keys, so two intents compare by content. */
function stable(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stable).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.entries(value as Record<string, unknown>)
      .filter(([, v]) => v !== undefined)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([k, v]) => `${JSON.stringify(k)}:${stable(v)}`)
      .join(",")}}`;
  }
  return JSON.stringify(value);
}

/** The seat's decisions in a turn: the state before each of its recorded intents. */
function decisionsIn(replay: MatchReplay, seat: Seat, turn: number): { index: number; before: MatchState }[] {
  const out: { index: number; before: MatchState }[] = [];
  let state = replayStart(replay);
  for (let i = 0; i < replay.intents.length; i += 1) {
    if (state.turnNumber > turn) break;
    if (replay.intents[i]!.seat === seat && state.turnNumber === turn) out.push({ index: i, before: state });
    state = replayApply(state, replay, i).state;
  }
  return out;
}

export type PositionAnalysis = {
  turn: number;
  step: number;
  decisionsThisTurn: number;
  activeSeat: Seat;
  phase: string;
  /** The seat's estimated chance to win from the position, 0 to 100. */
  winChance: number;
  options: { rank: number; label: string; winChance: number; samples: number; botPick: boolean }[];
  optionCount: number;
  /** What was really played there, and where it ranks; null when the game ended before the seat moved. */
  actual: { label: string; rank: number | null; winChance: number | null; matchedOption: boolean } | null;
  notes: string[];
};

/** Rank the seat's options at one decision of a finished game. Throws a readable error when there is no such decision. */
export function analyzePosition(replay: MatchReplay, req: PositionRequest): PositionAnalysis {
  if (!replay.end) throw new Error("Position analysis is for finished games only: this game has no recorded end yet.");
  const decisions = decisionsIn(replay, req.seat, req.turn);
  if (!decisions.length) throw new Error(`That seat made no decision in turn ${req.turn}. Pick another turn (the game has ${replay.intents.length} recorded moves).`);
  const step = req.step ?? 0;
  const chosen = decisions[step];
  if (!chosen) throw new Error(`That seat had ${decisions.length} decision${decisions.length === 1 ? "" : "s"} in turn ${req.turn}; step runs from 0 to ${decisions.length - 1}.`);
  const budgetMs = Math.min(Math.max(req.budgetMs ?? DEFAULT_BUDGET_MS, 50), MAX_BUDGET_MS);
  const ranked: PositionOption[] = rankOptions(chosen.before, req.seat, { budgetMs });
  const top = Math.min(Math.max(req.top ?? 5, 1), 10);
  const played: Intent = replay.intents[chosen.index]!.intent;
  const key = stable(played);
  const at = ranked.findIndex((o) => stable(o.intent) === key);
  const match = at >= 0 ? ranked[at]! : null;
  return {
    turn: req.turn,
    step,
    decisionsThisTurn: decisions.length,
    activeSeat: chosen.before.activeSeat,
    phase: chosen.before.phase,
    winChance: pct(winProbability(chosen.before, req.seat)),
    options: ranked.slice(0, top).map((o, i) => ({ rank: i + 1, label: o.label, winChance: pct(o.winChance), samples: o.samples, botPick: o.isBotPick })),
    optionCount: ranked.length,
    actual: {
      label: match?.label ?? played.type.replace(/_/g, " "),
      rank: at >= 0 ? at + 1 : null,
      winChance: match ? pct(match.winChance) : null,
      matchedOption: match !== null,
    },
    notes: [
      "Win chances are estimates from bot simulations of this position (the bot searches determinized copies, so it uses only what the seat could see). They are not results or player statistics, and small gaps between options are noise.",
      ...(at < 0 ? ["The move that was played is not among the ranked options (a choice the analysis does not rank), so it has no estimate."] : []),
    ],
  };
}

/** A finished game's replay for a position check: a player's own match (personal token) or an archive game (g_ or b_ id). */
export async function fetchReplayFor(api: PlannerApi, target: { matchId: string; token: string } | { gameId: string }): Promise<{ id: string; replay: MatchReplay; seat: Seat | null; kind: "match" | "game" | "botgame" }> {
  if (!api.serviceSecret) throw new Error("Position analysis isn't set up on this server (ANALYST_SERVICE_SECRET is unset).");
  try {
    if ("matchId" in target) {
      const body = await plannerCall<{ match_id: string; your_seat: number; replay: MatchReplay }>(api, target.token, `/analyst/matches/${encodeURIComponent(target.matchId)}/replay`, true);
      return { id: body.match_id, replay: body.replay, seat: body.your_seat as Seat, kind: "match" };
    }
    const bot = isBotGameId(target.gameId);
    const path = bot ? `/analyst/bot-games/${encodeURIComponent(target.gameId)}/replay` : `/analyst/corpus/games/${encodeURIComponent(target.gameId)}/replay`;
    const body = await plannerCall<{ game_id: string; replay: MatchReplay }>(api, null, path, true);
    return { id: body.game_id, replay: body.replay, seat: null, kind: bot ? "botgame" : "game" };
  } catch (err) {
    if (err instanceof PlannerApiError && err.status === 404) throw new Error("No replay is kept for that game, so its positions can't be analyzed.");
    throw err;
  }
}
