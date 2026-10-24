/**
 * A player's own games and decks, read from the planner API with their personal connector token.
 * Full replays need the analyst's service secret too; they are re-run here and narrated from the
 * player's seat. Each turn lists the player's own hand after the draw and both boards (public). The opponent's hand and
 * opening hand are named only once the game is over (the History page reveals them then too); the
 * player could not see them while it was being played.
 */
import {
  describeEvents,
  getCardDef,
  powerOf,
  projectGameEvents,
  replayMatch,
  winProbability,
  type CardInstance,
  type MatchReplay,
  type MatchState,
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

export const cardName = (id: string | null) => {
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

export type NarrateOptions = {
  fromTurn?: number;
  toTurn?: number;
  maxLines?: number;
  /** Add the viewer's estimated win chance at each turn start, and mark the biggest swings (reviews of finished games only; #635). */
  winChance?: boolean;
};

/** A turn start's estimated win chance for the viewer, from bot simulations. */
export type WinChancePoint = { turn: number; winChance: number; change: number | null };

/** Swings at least this many percentage points count as turning points; at most SWING_COUNT are marked. */
export const SWING_MIN_POINTS = 8;
export const SWING_COUNT = 3;

const pctOf = (p: number) => Math.round(p * 100);

/** Turns where the estimate moved most (either way) since the previous turn start, biggest first. */
export function biggestSwings(points: WinChancePoint[]): WinChancePoint[] {
  return points
    .filter((p) => p.change !== null && Math.abs(p.change) >= SWING_MIN_POINTS)
    .sort((a, b) => Math.abs(b.change!) - Math.abs(a.change!) || a.turn - b.turn)
    .slice(0, SWING_COUNT);
}

type Narration = {
  log: string[];
  truncated: boolean;
  openingHands: [(string | null)[], (string | null)[]];
  final: ReturnType<typeof replayMatch>;
  divergedAt: string | null;
  /** Every card id that sat in a visible zone (leader, board, trash, hand of the viewer) at a turn snapshot. */
  seenCardIds: string[];
  /** The viewer's estimated win chance at each turn start (empty unless asked for). */
  winChances: WinChancePoint[];
};

/** Lines kept in a narrated game unless the caller asks for another limit. */
export const DEFAULT_MAX_LINES = 600;

/** A deck as id, name and copies, sorted by card number so the list is stable. */
const deckList = (ids: string[]) => {
  const n = new Map<string, number>();
  for (const id of ids) n.set(id, (n.get(id) ?? 0) + 1);
  return [...n].sort(([a], [b]) => a.localeCompare(b)).map(([id, copies]) => ({ id, name: cardName(id), copies }));
};

/** A hand card's name, with its counter value when it has one (the model has no card lookup in a review). */
const handCardName = (id: string) => {
  const name = cardName(id);
  try {
    const counter = getCardDef(id).counter;
    return counter ? `${name} (counter ${counter})` : name;
  } catch {
    return name;
  }
};

/** One side's public board on a single line: Leader, Characters, Stage, then the counts. */
function boardLine(state: MatchState, seat: Seat, label: string): string {
  const p = state.players[seat];
  const piece = (c: CardInstance) =>
    [cardName(c.defId), String(powerOf(state, seat, c)), c.rested ? "rested" : "", c.attachedDonIds.length ? `+${c.attachedDonIds.length} DON!!` : ""]
      .filter(Boolean)
      .join(" ");
  const rested = p.costArea.filter((d) => d.rested).length;
  return (
    `${label} board: Leader ${piece(p.leader)}; ` +
    `Characters: ${p.characters.map((c) => piece(c)).join(", ") || "none"}; ` +
    `Stage: ${p.stage ? cardName(p.stage.defId) : "none"}. ` +
    `Life ${p.life.length}, deck ${p.deck.length}, DON!! ${p.costArea.length - rested} active / ${rested} rested / ${p.donDeck.length} in DON!! deck, trash ${p.trash.length}.`
  );
}

/**
 * Re-run a game and describe it turn by turn. With a seat, only what that seat could see is named
 * and lines say "you" and "opponent"; with view null (corpus games) every card is named and the
 * seats are Player A (seat 0) and Player B (seat 1). Each turn lists the hand(s) after the draw; with a
 * seat the opponent's hand is listed only when revealOpponent is set (a finished game).
 */
function narrate(replay: MatchReplay, view: Seat | null, opts: NarrateOptions, revealOpponent = false): Narration {
  // The estimate looks at the whole position, so it is given only for a seat's view of a finished game.
  const wantChance = view !== null && opts.winChance === true && revealOpponent;
  const winChances: WinChancePoint[] = [];
  /** Index in `lines` just after each turn's hand and board lines, so swing notes can be placed there. */
  const chanceAt = new Map<number, number>();
  const fromTurn = opts.fromTurn ?? 1;
  const toTurn = opts.toTurn ?? Number.POSITIVE_INFINITY;
  const maxLines = opts.maxLines ?? DEFAULT_MAX_LINES;
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
  const seen = new Set<string>();
  const noteSeen = (state: MatchState) => {
    for (const s of [0, 1] as Seat[]) {
      const p = state.players[s];
      for (const c of [p.leader, ...p.characters, ...(p.stage ? [p.stage] : [])]) seen.add(c.defId);
      for (const id of p.trash) seen.add(id);
      if (view === null || s === view || revealOpponent) for (const c of p.hand) seen.add(c.defId);
    }
  };
  // Without played mulligans the opening state is already turn 1; otherwise it's the mulligan step (turn 0)
  // and the hand to report is the one kept after each seat's mulligan choice.
  const openingHands: Narration["openingHands"] = [hand(opening, 0), hand(opening, 1)];
  const handLines = (state: typeof opening): string[] => {
    const names = (s: Seat) => state.players[s].hand.map((c) => handCardName(c.defId)).join(", ") || "empty";
    noteSeen(state);
    if (view === null) return [`Player A's hand: ${names(0)}.`, `Player B's hand: ${names(1)}.`, boardLine(state, 0, "Player A's"), boardLine(state, 1, "Player B's")];
    // Boards are public, so the opponent's is shown whether or not their hand is revealed.
    return [
      `Your hand after the draw: ${names(view)}.`,
      ...(revealOpponent ? [`Opponent's hand (revealed after the game): ${names((1 - view) as Seat)}.`] : []),
      boardLine(state, view, "Your"),
      boardLine(state, (1 - view) as Seat, "Opponent's"),
    ];
  };
  const noteChance = (state: MatchState, turn: number) => {
    if (!wantChance || winChances.some((w) => w.turn === turn)) return;
    const winChance = winProbability(state, view!);
    const prev = winChances[winChances.length - 1];
    winChances.push({ turn, winChance, change: prev ? pctOf(winChance) - pctOf(prev.winChance) : null });
    if (turn >= fromTurn && turn <= toTurn) {
      const before = lines.length;
      push(`Estimated chance you win from here: ${pctOf(winChance)}% (a bot-simulation estimate, not a result).`);
      if (lines.length > before) chanceAt.set(turn, lines.length);
    }
  };
  let final = opening;
  let lastGood = opening;
  let divergedAt: string | null = null;
  try {
    let turn = opening.turnNumber;
    let active = opening.activeSeat;
    const header = () =>
      view === null
        ? `--- Turn ${turn} (Player ${side(active)}'s turn) ---`
        : `--- Turn ${turn} (${active === view ? "your" : "opponent's"} turn) ---`;
    if (opening.phase !== "mulligan" && turn >= fromTurn && turn <= toTurn) {
      push(header());
      for (const line of handLines(opening)) push(line);
    }
    if (opening.phase !== "mulligan") noteChance(opening, turn);
    final = replayMatch(replay, (step) => {
      lastGood = step.state;
      let started = false;
      let opened = false;
      if (step.intent.type === "mulligan") openingHands[step.seat] = hand(step.state, step.seat);
      const events = view === null ? step.events : projectGameEvents(step.events, view);
      for (const event of events) {
        if (event.type === "phase_changed") {
          // The engine starts every turn (extra turns included) with a refresh phase and counts it.
          if (event.phase === "refresh") {
            turn += 1;
            active = event.activeSeat;
            opened = true;
            if (turn >= fromTurn && turn <= toTurn) {
              push(header());
              started = true;
            }
          }
          continue;
        }
        if (turn < fromTurn || turn > toTurn) continue;
        for (const line of describeEvents([event])) push(label(line));
      }
      // The step that opens a turn ends in its main phase, with the draw done: that is the hand to list.
      if (started) for (const line of handLines(step.state)) push(line);
      if (opened) noteChance(step.state, turn);
    });
  } catch (err) {
    divergedAt = err instanceof Error ? err.message : String(err);
    // A replay that throws leaves `final` unassigned: report the last state that was reached.
    final = lastGood;
  }
  noteSeen(final);
  // Turning points: a note after the estimate line of each of the biggest swings, placed from the back so earlier indexes hold.
  const swings = biggestSwings(winChances);
  for (const w of [...swings].sort((a, b) => b.turn - a.turn)) {
    const at = chanceAt.get(w.turn);
    if (at === undefined) continue;
    const from = pctOf(w.winChance) - w.change!;
    lines.splice(at, 0, `Turning point: your estimated win chance ${w.change! < 0 ? "fell" : "rose"} from ${from}% to ${pctOf(w.winChance)}% (${w.change! > 0 ? "+" : ""}${w.change} points) over the previous turn.`);
  }
  return { log: lines, truncated, openingHands, final, divergedAt, seenCardIds: [...seen], winChances };
}

const narrationNotes = (n: Narration, maxLines: number | undefined, first: string) => [
  first,
  ...(n.divergedAt ? [`The replay stopped early (${n.divergedAt}); card rules changed since this game.`] : []),
  ...(n.truncated ? [`Log cut at ${maxLines ?? DEFAULT_MAX_LINES} lines; ask for a turn range with fromTurn/toTurn.`] : []),
];

/** The game as a turn-by-turn log seen from one seat: your hidden cards named, the opponent's not. */
export function narrateReplay(replay: MatchReplay, seat: Seat, opts: NarrateOptions = {}) {
  // Same rule as the History page: the opponent's hand is shown for finished games only.
  const revealed = replay.end !== undefined && replay.end !== null;
  const n = narrate(replay, seat, opts, revealed);
  const you = n.final.players[seat];
  const opp = n.final.players[(1 - seat) as Seat];
  return {
    yourSeat: seat,
    wentFirst: replay.firstSeat === seat,
    yourLeader: cardName(replay.players[seat].leaderId),
    opponentLeader: cardName(replay.players[(1 - seat) as Seat].leaderId),
    yourLeaderId: replay.players[seat].leaderId,
    opponentLeaderId: replay.players[(1 - seat) as Seat].leaderId,
    yourDeck: deckList(replay.players[seat].deck),
    // The deck list is hidden information until the game is over, like the hand.
    ...(revealed ? { opponentDeck: deckList(replay.players[(1 - seat) as Seat].deck) } : {}),
    cardsInGame: n.seenCardIds,
    yourOpeningHand: n.openingHands[seat],
    ...(revealed ? { opponentOpeningHand: n.openingHands[(1 - seat) as Seat] } : {}),
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
    ...(n.winChances.length
      ? {
          winChanceByTurn: n.winChances.map((w) => ({ turn: w.turn, you: pctOf(w.winChance), change: w.change })),
          biggestSwings: biggestSwings(n.winChances).map((w) => ({ turn: w.turn, change: w.change, you: pctOf(w.winChance) })),
        }
      : {}),
    notes: narrationNotes(
      n,
      opts.maxLines,
      revealed
        ? "Log lines come from the duel engine re-running the game; 'Opponent' cards that were face-down to you show as 'a hidden card'. Each turn lists your hand after the draw and the opponent's hand, revealed because the game is over; the player couldn't see the opponent's hand during the game. Each turn also lists both boards (power, rested, attached DON!!, Life, deck, DON!!, trash), which are public, and the deck lists are in yourDeck and opponentDeck."
        : "Log lines come from the duel engine re-running the game; 'Opponent' cards that were face-down to you show as 'a hidden card'. Each turn lists your hand after the draw and both boards (power, rested, attached DON!!, Life, deck, DON!!, trash), which are public; your deck list is in yourDeck.",
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
    decks: { A: deckList(replay.players[0].deck), B: deckList(replay.players[1].deck) },
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
  return reviewGame(body.match_id, body.replay, body.your_seat as Seat, opts);
}

/** The game a review reads, from a raw replay and the reviewed seat (no planner API). Carries the win chance per turn and marks the biggest swings (#635). */
export function reviewGame(matchId: string, replay: MatchReplay, seat: Seat, opts: NarrateOptions = {}) {
  return { matchId, ...narrateReplay(replay, seat, { winChance: true, ...opts }) };
}

export type ReviewGame = ReturnType<typeof reviewGame>;

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
export function withCardNames(value: unknown, skip: readonly string[] = []): unknown {
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
  const body = await plannerCall<{ total: number; offset: number; window_days: number; games: { game_id: string; A: CorpusSide; B: CorpusSide }[] }>(
    api,
    null,
    `/analyst/corpus/games?${params}`,
    true,
  );
  const named = (s: CorpusSide) => ({ ...s, leader_name: cardName(s.leader) });
  return { ...body, games: body.games.map((g) => ({ ...g, A: named(g.A), B: named(g.B) })) };
}

/** Bot self-play games have ids like b_...; player games in the archive g_.... */
export const isBotGameId = (id: string): boolean => id.startsWith("b_");

/** One corpus game replayed with every card named. */
export async function replayGame(api: PlannerApi, gameId: string, opts: NarrateOptions = {}) {
  if (!api.serviceSecret) throw new Error("The game archive isn't set up on this server (ANALYST_SERVICE_SECRET is unset).");
  if (isBotGameId(gameId)) return replayBotGame(api, gameId, opts);
  const body = await plannerCall<{ game_id: string; date: string | null; ranked: boolean; rating_bands: Record<string, string | null>; replay: MatchReplay }>(
    api,
    null,
    `/analyst/corpus/games/${encodeURIComponent(gameId)}/replay`,
    true,
  );
  return { gameId: body.game_id, date: body.date, ranked: body.ranked, ratingBands: body.rating_bands, ...narrateGame(body.replay, opts) };
}

// ——— bot self-play games and simulated stats (#635) ———

const titleCase = (w: string) => w.charAt(0).toUpperCase() + w.slice(1);

/** "bot game (Hard vs Hard self-play)" from a levels string like "hard/hard". */
export function botLabel(levels?: string | null): string {
  const [a, b] = (levels ?? "").split("/");
  return a && b ? `bot game (${titleCase(a)} vs ${titleCase(b)} self-play)` : "bot game (self-play)";
}

export type BotCorpusQuery = Omit<CorpusQuery, "rankedOnly" | "days"> & { levels?: string };

type BotSide = { leader: string; won: boolean | null; went_first: boolean | null };

/** Bot self-play games on the engine matching the filters (ids b_...), labelled as bot games. */
export async function searchBotGames(api: PlannerApi, q: BotCorpusQuery) {
  if (!api.serviceSecret) throw new Error("The bot game archive isn't set up on this server (ANALYST_SERVICE_SECRET is unset).");
  const params = new URLSearchParams();
  const card = (v?: string) => v?.trim().toUpperCase();
  if (q.leader) params.set("leader", card(q.leader)!);
  if (q.opponent) params.set("opponent", card(q.opponent)!);
  if (q.card) params.set("card", card(q.card)!);
  if (q.result) params.set("result", q.result);
  if (q.wentFirst !== undefined) params.set("went_first", String(q.wentFirst));
  if (q.levels) params.set("levels", q.levels);
  for (const [key, value] of [["min_turns", q.minTurns], ["max_turns", q.maxTurns], ["limit", q.limit], ["offset", q.offset]] as const) {
    if (value !== undefined) params.set(key, String(value));
  }
  const body = await plannerCall<{ total: number; offset: number; games: { game_id: string; levels?: string; A: BotSide; B: BotSide }[] }>(api, null, `/analyst/bot-games?${params}`, true);
  const named = (s: BotSide) => ({ ...s, leader_name: cardName(s.leader) });
  return { ...body, games: body.games.map((g) => ({ ...g, kind: botLabel(g.levels), A: named(g.A), B: named(g.B) })) };
}

export type MatchSource = "players" | "bots" | "both";

/** search_matches over player games (default), bot games, or both side by side (limit and offset apply to each). */
export async function searchAnyGames(api: PlannerApi, q: CorpusQuery & { source?: MatchSource; levels?: string }) {
  const source = q.source ?? "players";
  if (source === "players") return searchGames(api, q);
  const { rankedOnly: _r, days: _d, ...botQuery } = q;
  if (source === "bots") return searchBotGames(api, botQuery);
  const [players, bots] = await Promise.all([searchGames(api, q), searchBotGames(api, botQuery)]);
  return {
    total: players.total + bots.total,
    offset: players.offset,
    window_days: players.window_days,
    player_games_total: players.total,
    bot_games_total: bots.total,
    games: [...players.games.map((g) => ({ ...g, kind: "player game" })), ...bots.games],
    notes: ["Player games (g_ ids) are real games between people; bot games (b_ ids) are simulated self-play between bots. Count and compare them separately."],
  };
}

/** One bot self-play game replayed with every card named: bots have no hidden information to protect. */
export async function replayBotGame(api: PlannerApi, gameId: string, opts: NarrateOptions = {}) {
  if (!api.serviceSecret) throw new Error("The bot game archive isn't set up on this server (ANALYST_SERVICE_SECRET is unset).");
  const body = await plannerCall<{ game_id: string; date: string | null; levels: string; rules_version: string; replay: MatchReplay }>(
    api,
    null,
    `/analyst/bot-games/${encodeURIComponent(gameId)}/replay`,
    true,
  );
  const game = narrateGame(body.replay, opts);
  return {
    gameId: body.game_id,
    date: body.date,
    kind: botLabel(body.levels),
    levels: body.levels,
    rulesVersion: body.rules_version,
    ...game,
    notes: [`This is a ${botLabel(body.levels)} on optcgduel.app's engine, not a game between people: the moves are the bots'.`, ...game.notes],
  };
}

export type SimQuery = { leader?: string; opponent?: string; levels?: string; days?: number; rulesVersion?: string };

const ID = "[A-Z]{2,4}\\d{2}-\\d{3}|P-\\d{3}";

/** A simulated line in words, with card names: "optional_accepted:OP08-058" is the "you may" effect of that card, accepted. */
export function lineDescription(line: string): string {
  const named = (id: string) => `${cardName(id) ?? id} (${id})`;
  const [kind, rest = ""] = [line.split(":")[0]!, line.slice(line.indexOf(":") + 1)];
  const hasRest = line.includes(":");
  switch (kind) {
    case "leader_activation":
      return "the Leader's Activate: Main used at least once";
    case "activation":
      return `Activate: Main of ${named(rest)} used`;
    case "optional_accepted":
      return `the optional ("You may") effect of ${named(rest)} accepted`;
    case "optional_declined":
      return `the optional ("You may") effect of ${named(rest)} declined`;
    case "counter_event":
      return hasRest ? `Counter Event ${named(rest)} played` : "at least one Counter Event played";
    case "cheat_out": {
      if (!hasRest) return "at least one Character put into play by an effect rather than played from hand";
      const m = new RegExp(`^(${ID}) via (${ID}|rules)$`).exec(rest);
      return m ? `${named(m[1]!)} put into play by ${m[2] === "rules" ? "the rules" : named(m[2]!)} rather than played from hand` : `Character put into play by an effect (${rest})`;
    }
    case "main_event":
      return `[Main] Event ${named(rest)} played`;
    default:
      return line;
  }
}

/** Simulated matchup win rates and line stats from bot self-play, named for reading. */
export async function simStats(api: PlannerApi, q: SimQuery) {
  if (!api.serviceSecret) throw new Error("Simulated stats aren't set up on this server (ANALYST_SERVICE_SECRET is unset).");
  const params = new URLSearchParams();
  if (q.leader) params.set("leader", q.leader.trim().toUpperCase());
  if (q.opponent) params.set("opponent", q.opponent.trim().toUpperCase());
  if (q.levels) params.set("levels", q.levels);
  if (q.days) params.set("days", String(q.days));
  if (q.rulesVersion) params.set("rules_version", q.rulesVersion);
  const stats = await plannerCall<Record<string, unknown>>(api, null, `/analyst/stats/sim?${params}`, true);
  const lines = Array.isArray(stats.lines)
    ? (stats.lines as { line: string }[]).map((l) => ({ ...l, description: lineDescription(l.line) }))
    : undefined;
  return withCardNames({ ...stats, ...(lines ? { lines } : {}) }, ["lines"]);
}
