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

async function getJson<T>(api: PlannerApi, token: string, path: string, service = false): Promise<T> {
  const headers: Record<string, string> = { "X-Analyst-Token": token };
  if (service) headers["X-Analyst-Service"] = api.serviceSecret;
  const res = await (api.fetchImpl ?? fetch)(`${api.baseUrl.replace(/\/$/, "")}${path}`, {
    headers,
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
  return (await res.json()) as T;
}

/** True when the planner still knows this personal token. */
export async function tokenIsValid(api: PlannerApi, token: string): Promise<boolean> {
  try {
    await getJson(api, token, "/analyst/me");
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
  const body = await getJson<{ matches: MatchSummary[] }>(api, token, `/analyst/matches?limit=${limit}`);
  return body.matches.map((m) => ({
    ...m,
    your_leader: cardName(m.your_leader_id),
    opponent_leader: cardName(m.opponent_leader_id),
  }));
}

export type PlannerDeck = { id: number; name: string; leader_id: string | null; cards: { id: string; copies: number }[] };

export async function listMyDecks(api: PlannerApi, token: string): Promise<PlannerDeck[]> {
  return (await getJson<{ decks: PlannerDeck[] }>(api, token, "/analyst/decks")).decks;
}

export type NarrateOptions = { fromTurn?: number; toTurn?: number; maxLines?: number };

/** The game as a turn-by-turn log seen from one seat: your hidden cards named, the opponent's not. */
export function narrateReplay(replay: MatchReplay, seat: Seat, opts: NarrateOptions = {}) {
  const fromTurn = opts.fromTurn ?? 1;
  const toTurn = opts.toTurn ?? Number.POSITIVE_INFINITY;
  const maxLines = opts.maxLines ?? 400;
  const who = (s: string) => (Number(s) === seat ? "you" : "opponent");
  const label = (line: string) =>
    line
      .replace(/Seat (\d)'s/g, (_m, s: string) => (who(s) === "you" ? "Your" : "Opponent's"))
      .replace(/Seat (\d)/g, (_m, s: string) => `Seat ${s} (${who(s)})`);
  const lines: string[] = [];
  let truncated = false;
  const push = (line: string) => {
    if (lines.length >= maxLines) truncated = true;
    else lines.push(line);
  };
  const opening = replayMatch({ ...replay, intents: [] });
  let final = opening;
  let divergedAt: string | null = null;
  try {
    let turn = opening.turnNumber;
    let active = opening.activeSeat;
    const header = () => `--- Turn ${turn} (${active === seat ? "your" : "opponent's"} turn) ---`;
    if (turn >= fromTurn && turn <= toTurn) push(header());
    final = replayMatch(replay, (step) => {
      for (const event of projectGameEvents(step.events, seat)) {
        if (event.type === "phase_changed") {
          // Turns alternate, so a new active seat starts the next turn.
          if (event.activeSeat !== active) {
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
  const you = final.players[seat];
  const opp = final.players[(1 - seat) as Seat];
  return {
    yourSeat: seat,
    wentFirst: replay.firstSeat === seat,
    yourLeader: cardName(replay.players[seat].leaderId),
    opponentLeader: cardName(replay.players[(1 - seat) as Seat].leaderId),
    yourOpeningHand: opening.players[seat].hand.map((c) => cardName(c.defId)),
    result: replay.end
      ? { won: replay.end.winner === seat, reason: replay.end.reason }
      : null,
    finalState: {
      turn: final.turnNumber,
      yourLife: you.life.length,
      opponentLife: opp.life.length,
      yourBoard: you.characters.map((c) => cardName(c.defId)),
      opponentBoard: opp.characters.map((c) => cardName(c.defId)),
      yourHandSize: you.hand.length,
      opponentHandSize: opp.hand.length,
    },
    log: lines,
    truncated,
    notes: [
      "Log lines come from the duel engine re-running the game; 'Opponent' cards that were face-down to you show as 'a hidden card'.",
      ...(divergedAt ? [`The replay stopped early (${divergedAt}); card rules changed since this game.`] : []),
      ...(truncated ? [`Log cut at ${maxLines} lines; ask for a turn range with fromTurn/toTurn.`] : []),
    ],
  };
}

export async function reviewMatch(api: PlannerApi, token: string, matchId: string, opts: NarrateOptions = {}) {
  if (!api.serviceSecret) throw new Error("Match review isn't set up on this server (ANALYST_SERVICE_SECRET is unset).");
  const body = await getJson<{ match_id: string; your_seat: number; replay: MatchReplay }>(
    api,
    token,
    `/analyst/matches/${encodeURIComponent(matchId)}/replay`,
    true,
  );
  return { matchId: body.match_id, ...narrateReplay(body.replay, body.your_seat as Seat, opts) };
}
