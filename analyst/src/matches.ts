/**
 * A player's own games and decks, read from the planner API with their personal connector token.
 * Full replays need the analyst's service secret too; they are re-run here and narrated only
 * from the player's seat, so the opponent's hand and deck never reach the chat.
 */
import {
  describeEvents,
  getCardDef,
  projectGameEvents,
  replayMatch,
  type MatchReplay,
  type Seat,
} from "@optcg/rules";

export type PlannerApi = { baseUrl: string; serviceSecret: string; fetchImpl?: typeof fetch };

export class PlannerApiError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
  }
}

/** A planner API call: the player's token (when given), the service secret (when asked), JSON in and out. */
export async function plannerCall<T>(api: PlannerApi, token: string | null, path: string, service = false, body?: unknown, method?: "PUT"): Promise<T> {
  const headers: Record<string, string> = {};
  if (token !== null) headers["X-Analyst-Token"] = token;
  if (service) headers["X-Analyst-Service"] = api.serviceSecret;
  if (body !== undefined) headers["Content-Type"] = "application/json";
  const res = await (api.fetchImpl ?? fetch)(`${api.baseUrl.replace(/\/$/, "")}${path}`, {
    method: method ?? (body === undefined ? "GET" : "POST"),
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
    signal: AbortSignal.timeout(15_000),
  });
  if (!res.ok) {
    let detail = `HTTP ${res.status}`;
    try {
      const body = (await res.json()) as { detail?: unknown };
      if (typeof body.detail === "string") detail = body.detail;
    } catch {
      /* not JSON */
    }
    throw new PlannerApiError(res.status, detail);
  }
  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}

/** True when the planner still knows this personal token. */
export async function tokenIsValid(api: PlannerApi, token: string): Promise<boolean> {
  try {
    await plannerCall(api, token, "/analyst/me");
    return true;
  } catch (err) {
    if (err instanceof PlannerApiError && err.status === 401) return false;
    throw err;
  }
}

export type MatchSummary = {
  match_id: string;
  created_at: string | null;
  ranked: boolean;
  your_seat: number;
  won: boolean;
  reason: string;
  turns: number | null;
  your_leader_id: string | null;
  opponent_leader_id: string | null;
  opponent_name: string;
  rating_before: number;
  rating_after: number;
  has_replay: boolean;
};

const cardName = (id: string | null) => {
  if (!id) return null;
  try {
    return getCardDef(id).name;
  } catch {
    return id;
  }
};

export async function listMyMatches(api: PlannerApi, token: string, limit = 20) {
  const body = await plannerCall<{ matches: MatchSummary[] }>(api, token, `/analyst/matches?limit=${limit}`);
  return body.matches.map((m) => ({
    ...m,
    your_leader: cardName(m.your_leader_id),
    opponent_leader: cardName(m.opponent_leader_id),
  }));
}

export type PlannerDeck = { id: number; name: string; leader_id: string | null; cards: { id: string; copies: number }[] };

export async function listMyDecks(api: PlannerApi, token: string): Promise<PlannerDeck[]> {
  return (await plannerCall<{ decks: PlannerDeck[] }>(api, token, "/analyst/decks")).decks;
}

export type NarrateOptions = { fromTurn?: number; toTurn?: number; maxLines?: number };

type Narration = {
  log: string[];
  truncated: boolean;
  openingHands: [(string | null)[], (string | null)[]];
  final: ReturnType<typeof replayMatch>;
  divergedAt: string | null;
};

/**
 * Re-run a game and describe it turn by turn. With a seat, only what that seat could see is named
 * and lines say "you" and "opponent"; with view null (corpus games) every card is named and the
 * seats are Player A (seat 0) and Player B (seat 1).
 */
function narrate(replay: MatchReplay, view: Seat | null, opts: NarrateOptions): Narration {
  const fromTurn = opts.fromTurn ?? 1;
  const toTurn = opts.toTurn ?? Number.POSITIVE_INFINITY;
  const maxLines = opts.maxLines ?? 400;
  const side = (s: number) => (s === 0 ? "A" : "B");
  const label = (line: string) =>
    view === null
      ? line.replace(/Seat (\d)'s/g, (_m, s: string) => `Player ${side(Number(s))}'s`).replace(/Seat (\d)/g, (_m, s: string) => `Player ${side(Number(s))}`)
      : line
          .replace(/Seat (\d)'s/g, (_m, s: string) => (Number(s) === view ? "Your" : "Opponent's"))
          .replace(/Seat (\d)/g, (_m, s: string) => `Seat ${s} (${Number(s) === view ? "you" : "opponent"})`);
  const lines: string[] = [];
  let truncated = false;
  const push = (line: string) => {
    if (lines.length >= maxLines) truncated = true;
    else lines.push(line);
  };
  const opening = replayMatch({ ...replay, intents: [] });
  const hand = (state: typeof opening, s: Seat) => state.players[s].hand.map((c) => cardName(c.defId));
  // Without played mulligans the opening state is already turn 1; otherwise it's the mulligan step (turn 0)
  // and the hand to report is the one kept after each seat's mulligan choice.
  const openingHands: Narration["openingHands"] = [hand(opening, 0), hand(opening, 1)];
  let final = opening;
  let divergedAt: string | null = null;
  try {
    let turn = opening.turnNumber;
    let active = opening.activeSeat;
    const header = () =>
      view === null
        ? `--- Turn ${turn} (Player ${side(active)}'s turn) ---`
        : `--- Turn ${turn} (${active === view ? "your" : "opponent's"} turn) ---`;
    if (opening.phase !== "mulligan" && turn >= fromTurn && turn <= toTurn) push(header());
    final = replayMatch(replay, (step) => {
      if (step.intent.type === "mulligan") openingHands[step.seat] = hand(step.state, step.seat);
      const events = view === null ? step.events : projectGameEvents(step.events, view);
      for (const event of events) {
        if (event.type === "phase_changed") {
          // The engine starts every turn (extra turns included) with a refresh phase and counts it.
          if (event.phase === "refresh") {
            turn += 1;
            active = event.activeSeat;
            if (turn >= fromTurn && turn <= toTurn) push(header());
          }
          continue;
        }
        if (turn < fromTurn || turn > toTurn) continue;
        for (const line of describeEvents([event])) push(label(line));
      }
    });
  } catch (err) {
    divergedAt = err instanceof Error ? err.message : String(err);
  }
  return { log: lines, truncated, openingHands, final, divergedAt };
}

const narrationNotes = (n: Narration, maxLines: number | undefined, first: string) => [
  first,
  ...(n.divergedAt ? [`The replay stopped early (${n.divergedAt}); card rules changed since this game.`] : []),
  ...(n.truncated ? [`Log cut at ${maxLines ?? 400} lines; ask for a turn range with fromTurn/toTurn.`] : []),
];

/** The game as a turn-by-turn log seen from one seat: your hidden cards named, the opponent's not. */
export function narrateReplay(replay: MatchReplay, seat: Seat, opts: NarrateOptions = {}) {
  const n = narrate(replay, seat, opts);
  const you = n.final.players[seat];
  const opp = n.final.players[(1 - seat) as Seat];
  return {
    yourSeat: seat,
    wentFirst: replay.firstSeat === seat,
    yourLeader: cardName(replay.players[seat].leaderId),
    opponentLeader: cardName(replay.players[(1 - seat) as Seat].leaderId),
    yourOpeningHand: n.openingHands[seat],
    result: replay.end
      ? { won: replay.end.winner === seat, reason: replay.end.reason }
      : null,
    finalState: {
      turn: n.final.turnNumber,
      yourLife: you.life.length,
      opponentLife: opp.life.length,
      yourBoard: you.characters.map((c) => cardName(c.defId)),
      opponentBoard: opp.characters.map((c) => cardName(c.defId)),
      yourHandSize: you.hand.length,
      opponentHandSize: opp.hand.length,
    },
    log: n.log,
    truncated: n.truncated,
    notes: narrationNotes(
      n,
      opts.maxLines,
      "Log lines come from the duel engine re-running the game; 'Opponent' cards that were face-down to you show as 'a hidden card'.",
    ),
  };
}

/** A corpus game with every card named, its seats as Player A and Player B. */
export function narrateGame(replay: MatchReplay, opts: NarrateOptions = {}) {
  const n = narrate(replay, null, opts);
  const sideState = (s: Seat) => {
    const p = n.final.players[s];
    return { life: p.life.length, board: p.characters.map((c) => cardName(c.defId)), hand: p.hand.map((c) => cardName(c.defId)) };
  };
  return {
    wentFirst: replay.firstSeat === 0 ? "A" : "B",
    leaders: { A: cardName(replay.players[0].leaderId), B: cardName(replay.players[1].leaderId) },
    openingHands: { A: n.openingHands[0], B: n.openingHands[1] },
    result: replay.end ? { winner: replay.end.winner === 0 ? "A" : "B", reason: replay.end.reason } : null,
    finalState: { turn: n.final.turnNumber, A: sideState(0), B: sideState(1) },
    log: n.log,
    truncated: n.truncated,
    notes: narrationNotes(n, opts.maxLines, "Every card is named, hidden ones included: this is the full game, not one player's view."),
  };
}

export async function reviewMatch(api: PlannerApi, token: string, matchId: string, opts: NarrateOptions = {}) {
  if (!api.serviceSecret) throw new Error("Match review isn't set up on this server (ANALYST_SERVICE_SECRET is unset).");
  const body = await plannerCall<{ match_id: string; your_seat: number; replay: MatchReplay }>(
    api,
    token,
    `/analyst/matches/${encodeURIComponent(matchId)}/replay`,
    true,
  );
  return { matchId: body.match_id, ...narrateReplay(body.replay, body.your_seat as Seat, opts) };
}

export type StatsQuery = { leader?: string; opponent?: string; days?: number; rankedOnly?: boolean };

/** Leader and matchup win rates from recorded duels (aggregates only), named for reading. */
export async function matchupStats(api: PlannerApi, q: StatsQuery) {
  if (!api.serviceSecret) throw new Error("Match stats aren't set up on this server (ANALYST_SERVICE_SECRET is unset).");
  const params = new URLSearchParams();
  if (q.leader) params.set("leader", q.leader.trim().toUpperCase());
  if (q.opponent) params.set("opponent", q.opponent.trim().toUpperCase());
  if (q.days) params.set("days", String(q.days));
  if (q.rankedOnly) params.set("ranked_only", "true");
  const stats = await plannerCall<Record<string, unknown>>(api, null, `/analyst/stats/matchups?${params}`, true);
  return withCardNames(stats);
}

/** Card names next to every card number (leader, opponent and id keys), so the model never has to guess one. Keys in `skip` are left alone. */
function withCardNames(value: unknown, skip: readonly string[] = []): unknown {
  if (Array.isArray(value)) return value.map((v) => withCardNames(v, skip));
  if (!value || typeof value !== "object") return value;
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(value)) {
    out[k] = skip.includes(k) ? v : withCardNames(v, skip);
    if ((k === "leader" || k === "opponent" || k === "id") && typeof v === "string") out[`${k}_name`] = cardName(v);
  }
  return out;
}

export type TournamentQuery = { leader?: string; opponent?: string; days?: number; minPlayers?: number };

/** Leader and matchup results from Limitless TCG tournaments (aggregates and top lists, no player names), named for reading. */
export async function tournamentStats(api: PlannerApi, q: TournamentQuery) {
  if (!api.serviceSecret) throw new Error("Tournament stats aren't set up on this server (ANALYST_SERVICE_SECRET is unset).");
  const params = new URLSearchParams();
  if (q.leader) params.set("leader", q.leader.trim().toUpperCase());
  if (q.opponent) params.set("opponent", q.opponent.trim().toUpperCase());
  if (q.days) params.set("days", String(q.days));
  if (q.minPlayers) params.set("min_players", String(q.minPlayers));
  const stats = await plannerCall<Record<string, unknown>>(api, null, `/analyst/tournaments/stats?${params}`, true);
  // Events have ids of their own (not card numbers).
  return withCardNames(stats, ["events", "top_placings"]);
}

export type LessonDraft = { text: string; leader_id?: string; opponent_id?: string; cards?: string[]; match_ids?: string[] };

export async function draftLesson(api: PlannerApi, token: string, lesson: LessonDraft) {
  return plannerCall<Record<string, unknown>>(api, token, "/analyst/lessons", false, lesson);
}

export async function myLessons(api: PlannerApi, token: string, status = "approved", leader?: string) {
  const params = new URLSearchParams({ status });
  if (leader) params.set("leader", leader.trim().toUpperCase());
  return (await plannerCall<{ lessons: unknown[] }>(api, token, `/analyst/lessons?${params}`)).lessons;
}

export type CorpusQuery = {
  leader?: string;
  opponent?: string;
  card?: string;
  result?: "won" | "lost";
  wentFirst?: boolean;
  rankedOnly?: boolean;
  days?: number;
  minTurns?: number;
  maxTurns?: number;
  limit?: number;
  offset?: number;
};

type CorpusSide = { leader: string; won: boolean; went_first: boolean | null; rating_band: string | null };

/** Every shared game on optcgduel.app matching the filters, anonymized (opaque game ids, sides A and B). */
export async function searchGames(api: PlannerApi, q: CorpusQuery) {
  if (!api.serviceSecret) throw new Error("The game archive isn't set up on this server (ANALYST_SERVICE_SECRET is unset).");
  const params = new URLSearchParams();
  const card = (v?: string) => v?.trim().toUpperCase();
  if (q.leader) params.set("leader", card(q.leader)!);
  if (q.opponent) params.set("opponent", card(q.opponent)!);
  if (q.card) params.set("card", card(q.card)!);
  if (q.result) params.set("result", q.result);
  if (q.wentFirst !== undefined) params.set("went_first", String(q.wentFirst));
  if (q.rankedOnly) params.set("ranked_only", "true");
  for (const [key, value] of [["days", q.days], ["min_turns", q.minTurns], ["max_turns", q.maxTurns], ["limit", q.limit], ["offset", q.offset]] as const) {
    if (value !== undefined) params.set(key, String(value));
  }
  const body = await plannerCall<{ total: number; offset: number; window_days: number; games: { A: CorpusSide; B: CorpusSide }[] }>(
    api,
    null,
    `/analyst/corpus/games?${params}`,
    true,
  );
  const named = (s: CorpusSide) => ({ ...s, leader_name: cardName(s.leader) });
  return { ...body, games: body.games.map((g) => ({ ...g, A: named(g.A), B: named(g.B) })) };
}

/** One corpus game replayed with every card named. */
export async function replayGame(api: PlannerApi, gameId: string, opts: NarrateOptions = {}) {
  if (!api.serviceSecret) throw new Error("The game archive isn't set up on this server (ANALYST_SERVICE_SECRET is unset).");
  const body = await plannerCall<{ game_id: string; date: string | null; ranked: boolean; rating_bands: Record<string, string | null>; replay: MatchReplay }>(
    api,
    null,
    `/analyst/corpus/games/${encodeURIComponent(gameId)}/replay`,
    true,
  );
  return { gameId: body.game_id, date: body.date, ranked: body.ranked, ratingBands: body.rating_bands, ...narrateGame(body.replay, opts) };
}
