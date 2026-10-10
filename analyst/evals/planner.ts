/**
 * A fake planner API for the eval, in memory, used by the real chat loop (`runChat`):
 *  - chat threads, usage and budget stay local in every mode, so eval spend never reaches a player's caps;
 *  - the turn runChat saves is captured as the trace;
 *  - matchup stats come from fixtures/stats.json (synthetic, in the backend's shape) or, with mode "live",
 *    stats, corpus and tournament reads are forwarded to the real planner with the service secret.
 */
import type { Message, Usage } from "../src/chat";
import type { PlannerApi } from "../src/matches";

export type StatsFixtures = { synthetic: true; responses: Record<string, unknown> };
export type TournamentFixtures = { synthetic: true; responses: Record<string, unknown> };

export type PlannerOptions = {
  mode: "fake" | "live";
  stats: StatsFixtures;
  tournaments?: TournamentFixtures;
  liveUrl?: string;
  secret?: string;
  /** For tests: the fetch used for forwarded calls in live mode. */
  forward?: typeof fetch;
};

export type Captured = { turn: Message[] | null; usage: Usage[]; paths: string[] };

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
const MIN_GAMES = 5;
const emptyRecord = { games: 0, wins: null, win_rate: null, interval: null, too_few_games: true };
const emptySplit = { ...emptyRecord, going_first: emptyRecord, going_second: emptyRecord, average_turns: null };

/** The fixture answer for a stats query: keyed by leader and opponent only, and a no-games record for anything else. */
export function statsAnswer(fixtures: StatsFixtures, params: URLSearchParams): unknown {
  const leader = params.get("leader");
  const opponent = params.get("opponent");
  const key = [leader && `leader=${leader}`, opponent && `opponent=${opponent}`].filter(Boolean).join("&");
  const window = { days: Number(params.get("days") ?? 90), ranked_only: params.get("ranked_only") === "true", min_games: MIN_GAMES, source: "optcgduel.app duels" };
  if (key in fixtures.responses) return { ...(fixtures.responses[key] as object), ...window };
  if (!leader) return { ...window, total_games: 0, leaders: [] };
  if (opponent) return { ...window, leader, opponent, ...emptySplit };
  return { ...window, leader, overall: emptySplit, opponents: [], cards: [] };
}

/** The fixture answer for a tournament query, keyed by leader and opponent ("" for the meta overview); a leader with no fixture has no decks. */
export function tournamentAnswer(fixtures: TournamentFixtures, params: URLSearchParams): unknown {
  const leader = params.get("leader");
  const opponent = params.get("opponent");
  const key = [leader && `leader=${leader}`, opponent && `opponent=${opponent}`].filter(Boolean).join("&");
  const window = { days: Number(params.get("days") ?? 30), min_players: Number(params.get("min_players") ?? 8), min_games: MIN_GAMES, source: "Limitless TCG tournaments" };
  if (!leader && !opponent && "" in fixtures.responses) return { ...(fixtures.responses[""] as object), ...window };
  if (key in fixtures.responses) return { ...(fixtures.responses[key] as object), ...window };
  if (!leader) return { ...window, events: [], total_decks: 0, total_games: 0, leaders: [] };
  if (opponent) return { ...window, leader, opponent, events: [], ...emptyRecord, ties: 0 };
  return { ...window, leader, events: [], meta: { decks: 0, total_decks: 0, share: 0 }, overall: { ...emptyRecord, ties: 0 }, mirror_games: 0, opponents: [], top_placings: [], decklists: 0, too_few_decks: true, cards: [] };
}

export function evalPlanner(opts: PlannerOptions): { api: PlannerApi; captured: Captured } {
  const captured: Captured = { turn: null, usage: [], paths: [] };
  let nextThread = 1;
  const live = opts.mode === "live";
  const fetchImpl = (async (input: string | URL | Request, init?: RequestInit) => {
    const url = new URL(String(input));
    const path = url.pathname;
    const method = init?.method ?? "GET";
    captured.paths.push(`${method} ${path}`);
    if (method === "POST" && path === "/analyst/chat/threads") return json({ id: nextThread++ });
    if (method === "POST" && /^\/analyst\/chat\/threads\/\d+\/messages$/.test(path)) {
      captured.turn = (JSON.parse(String(init?.body)) as { messages: Message[] }).messages;
      return json({ ok: true });
    }
    if (method === "POST" && path === "/analyst/chat/usage") {
      const b = JSON.parse(String(init?.body)) as Record<string, number>;
      captured.usage.push({
        input_tokens: b.input_tokens ?? 0,
        output_tokens: b.output_tokens ?? 0,
        cache_read_input_tokens: b.cache_read_tokens ?? 0,
        cache_creation_input_tokens: b.cache_write_tokens ?? 0,
      });
      return json({ ok: true });
    }
    if (method === "GET" && path === "/analyst/chat/budget") return json({ allowed: true, spent_today_usd: 0, daily_cap_usd: 1_000_000 });
    const forwarded = /^\/analyst\/(stats|corpus|tournaments)\//.test(path);
    if (live && forwarded && opts.liveUrl) {
      const headers = { "X-Analyst-Service": opts.secret ?? "" };
      return (opts.forward ?? fetch)(`${opts.liveUrl.replace(/\/$/, "")}${path}${url.search}`, { method, headers, signal: AbortSignal.timeout(15_000) });
    }
    if (method === "GET" && path === "/analyst/stats/matchups") return json(statsAnswer(opts.stats, url.searchParams));
    if (method === "GET" && path.startsWith("/analyst/corpus/games")) return json({ total: 0, offset: 0, window_days: 90, games: [] });
    if (method === "GET" && path === "/analyst/tournaments/stats" && opts.tournaments) return json(tournamentAnswer(opts.tournaments, url.searchParams));
    if (method === "GET" && path === "/analyst/decks") return json({ decks: [] });
    if (method === "GET" && path === "/analyst/matches") return json({ matches: [] });
    if (method === "GET" && path === "/analyst/lessons") return json({ lessons: [] });
    return json({ detail: `The eval planner has no route for ${method} ${path}` }, 404);
  }) as unknown as typeof fetch;
  return { api: { baseUrl: "https://planner.eval", serviceSecret: opts.secret || "eval", fetchImpl }, captured };
}
