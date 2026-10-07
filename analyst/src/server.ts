/**
 * Log Pose MCP server: the analyst's tools, served to Claude (custom connector) over MCP.
 * The model runs in the Claude app; this server only answers tool calls.
 */
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { ToolAnnotations } from "@modelcontextprotocol/sdk/types.js";
import { z } from "zod";
import { analyzeDeck, deckDrawOdds, describeDeck, rawDrawOdds } from "./analysis";
import type { Catalog, CardRow } from "./catalog";
import { exportDeck, resolveDeck } from "./decks";
import { banListView, cardRulings, deckBanCheck, rulesLookup } from "./knowledge";
import {
  draftLesson,
  listMyDecks,
  listMyMatches,
  matchupStats,
  myLessons,
  replayGame,
  reviewMatch,
  searchGames,
  tournamentStats,
  type PlannerApi,
} from "./matches";
import type { OfficialLibrary } from "./official/library";
import { newestFormat, queryPlaybook, type Playbook } from "./playbook";
import { searchCards } from "./search";

export const INSTRUCTIONS = `You are Log Pose, a One Piece Card Game deck analyst for the OPTCG Deck Planner.
Talk like a veteran player and judge: give game plans, mulligan advice, matchup reasoning, key turns, combo lines and unusual or "cheese" lines when they exist, and say how strong players would pilot the deck.

Ground rules:
- Card facts come from tools. Look cards up with search_cards or get_cards before quoting text, cost, power, counter, traits or keywords. Never invent card numbers.
- Numbers come from tools. Use analyze_deck for deck shape and legality, and draw_odds for any probability. Quote the numbers you were given; don't estimate them yourself.
- Matchup opinions are your judgement. Say so, and say which cards or turns they hinge on. Win rates come only from matchup_stats (games played on optcgduel.app) and tournament_stats (results of real tournaments, from Limitless TCG): quote them with the number of games and the interval, say when a sample is marked too_few_games, and say which of the two they come from. Never estimate a win rate yourself.
- Tournament results: tournament_stats reports events from Limitless TCG (play.limitlesstcg.com): a leader's meta share, its record against other leaders, its best finishes with their decklists and how often each card is played. Credit Limitless TCG when you quote it. Always keep tournament numbers apart from optcgduel.app numbers: never add them together, average them or call one the other, and give each its own games and interval. Tournament decks are tuned and the players are experienced, so say when the two disagree instead of blending them.
- Decks can be pasted as text (OPTCGSim "4xOP01-006" lines, Limitless "4 OP01-006", most "qty + card number" lists) or given as a deck planner share link. When a user mentions a deck, load it first with analyze_deck.
- Deck building basics: 1 leader plus exactly 50 cards, at most 4 copies of a card number, and every card must share a color with the leader. Some leaders add their own deck rules; analyze_deck checks them, and the official ban list (banned cards, restricted cards, banned pairs, and announced changes with their start date).
- Rules questions: use rules_lookup and cite comprehensive rules section numbers. For how a specific card works or interacts, check card_rulings first: official Q&A answers and errata outrank your own reading of the text. Say when no official ruling covers the case.
- Strategy: check playbook for the leader (and the matchup) before giving a game plan. Notes say which set they were written for and whether a player has reviewed them; mention it when a note is a draft or older than the current set, and don't present it as settled fact.
- Real games: search_matches finds games from every player on optcgduel.app who shares their games (anonymized, sides A and B), and replay_match shows one with every card named. Use them to back up matchup advice with how games actually went, and cite game ids.
- When you suggest changes, list them as +N / -N lines with card numbers so they are easy to apply, and offer export_deck to produce an OPTCGSim list.`;

const PERSONAL_INSTRUCTIONS = `

This is the player's personal link, so you can also see their own games and decks:
- list_my_decks lists their deck planner decks; pass a deck's cards to analyze_deck.
- list_my_matches lists their recent duels (leaders, result, turns). review_match replays one game turn by turn from their seat. Review it like a coach: the turns that decided the game, misplays and better lines, and what the opponent's deck showed. You never see the opponent's hidden cards, so don't guess them as fact.
- Lessons: when reviews show a pattern the player can act on, offer to save it with draft_lesson: one or two specific sentences, the leader and opponent it applies to, and the match ids it came from. Drafts wait for the player to approve them in the duel app (Settings, Log Pose). my_lessons returns their approved lessons; check it with playbook before advising on a leader they play.`;

const cardColors = z.enum(["red", "green", "blue", "purple", "black", "yellow"]);

const deckInput = {
  text: z.string().max(20_000).optional().describe("Pasted deck list, one card per line, e.g. 1xOP05-060 then 4xOP05-067"),
  shareLink: z.string().max(500).optional().describe("Deck planner share link, e.g. https://optcg-deck-planner.app/share/<token>"),
  leaderId: z.string().max(20).optional().describe("Leader card number, when the list doesn't include one"),
  cards: z.array(z.object({ id: z.string().max(20), copies: z.number().int().min(1).max(50) })).max(60).optional(),
};

const compactCard = (c: CardRow) => ({
  id: c.id,
  name: c.name,
  type: c.type,
  colors: c.colors,
  cost: c.cost,
  power: c.power,
  counter: c.counter,
  life: c.life,
  traits: c.traits,
  keywords: c.keywords.length ? c.keywords : undefined,
  text: c.text || undefined,
  trigger: c.trigger || undefined,
});

const json = (value: unknown) => ({ content: [{ type: "text" as const, text: JSON.stringify(value) }] });

const failure = (err: unknown) => ({
  isError: true,
  content: [{ type: "text" as const, text: err instanceof Error ? err.message : String(err) }],
});

/** The signed-in player behind a personal connector link. */
export type PersonalContext = { api: PlannerApi; token: string };

/** Official rules material and the strategy playbook; tools that need them are left out without them. */
export type Knowledge = { library?: OfficialLibrary; playbook?: Playbook; stats?: PlannerApi };

type ToolResult = { content: { type: "text"; text: string }[]; isError?: boolean };

/** One analyst tool, served over MCP and to the in-app chat alike. */
export type ToolDef = {
  name: string;
  title: string;
  description: string;
  inputSchema: z.ZodRawShape;
  annotations: ToolAnnotations;
  run: (args: Record<string, unknown>) => Promise<ToolResult>;
};

type Add = <S extends z.ZodRawShape>(
  name: string,
  config: { title: string; description: string; inputSchema: S; annotations: ToolAnnotations },
  handler: (args: z.infer<z.ZodObject<S>>) => Promise<ToolResult>,
) => void;

export function instructionsFor(personal: boolean): string {
  return personal ? INSTRUCTIONS + PERSONAL_INSTRUCTIONS : INSTRUCTIONS;
}

export function createServer(catalog: Catalog, fetchImpl?: typeof fetch, personal?: PersonalContext, knowledge: Knowledge = {}): McpServer {
  const server = new McpServer({ name: "log-pose", version: "0.1.0" }, { instructions: instructionsFor(Boolean(personal)) });
  for (const t of buildTools(catalog, fetchImpl, personal, knowledge)) {
    server.registerTool(
      t.name,
      { title: t.title, description: t.description, inputSchema: t.inputSchema, annotations: t.annotations },
      (args: Record<string, unknown>) => t.run(args),
    );
  }
  return server;
}

/** Every tool this caller gets: the card tools always, rules, playbook and stats when configured, and the player's own games with a personal context. */
export function buildTools(catalog: Catalog, fetchImpl?: typeof fetch, personal?: PersonalContext, knowledge: Knowledge = {}): ToolDef[] {
  const tools: ToolDef[] = [];
  const add: Add = (name, config, handler) => {
    tools.push({ name, ...config, run: handler as ToolDef["run"] });
  };
  const readOnly = { readOnlyHint: true, openWorldHint: false } as const;

  add(
    "search_cards",
    {
      title: "Search cards",
      description:
        "Filter all One Piece Card Game cards (English card list) by any combination of fields. List filters match any value, except keywords, which must all be present. " +
        "timings are ability timings: on_play, when_attacking, on_ko, activate_main, main, counter, trigger, on_opp_attack, on_block, end_of_your_turn, on_event, replacement. " +
        "effects are effect kinds from the parsed card text: ko, rest, to_hand (bounce or recursion), to_deck, draw, look (search the top of the deck), play (play a card from hand/trash/deck), power, base_power, cost, add_don, give_don, set_don_active, rest_don, return_don, discard, mill, deck_to_life, hand_to_life, life_to_hand, trash_life, look_life, to_life, negate, restrict, player_restrict, keyword (grants a keyword), redirect_attack, damage, extra_turn, win. " +
        "Use legalFor with a leader's card number to list only cards that deck may include.",
      inputSchema: {
        query: z.string().max(100).optional().describe("Substring of name, effect text or trigger text"),
        name: z.string().max(100).optional().describe("Substring of the card name"),
        colors: z.array(cardColors).max(6).optional(),
        colorMode: z.enum(["any", "only"]).optional().describe("any (default): shares a listed color. only: all its colors are listed"),
        types: z.array(z.enum(["leader", "character", "event", "stage"])).max(4).optional(),
        costMin: z.number().int().min(0).max(10).optional(),
        costMax: z.number().int().min(0).max(10).optional(),
        powerMin: z.number().int().min(0).max(15000).optional(),
        powerMax: z.number().int().min(0).max(15000).optional(),
        counters: z.array(z.number().int().min(0).max(2000)).max(4).optional().describe("Allowed printed counters; 0 means no counter"),
        traits: z.array(z.string().max(60)).max(10).optional().describe("Traits (types) such as Straw Hat Crew, Navy, Supernovas"),
        attributes: z.array(z.string().max(30)).max(5).optional().describe("Slash, Strike, Ranged, Special, Wisdom"),
        keywords: z.array(z.string().max(30)).max(5).optional().describe("Rush, Blocker, Double Attack, Banish, Unblockable…"),
        timings: z.array(z.string().max(30)).max(10).optional(),
        effects: z.array(z.string().max(30)).max(10).optional(),
        hasTrigger: z.boolean().optional(),
        set: z.string().max(6).optional().describe("Set code, e.g. OP05, ST10, EB01, PRB01, P"),
        legalFor: z.string().max(20).optional().describe("Leader card number; only cards that leader's deck can include"),
        limit: z.number().int().min(1).max(100).optional(),
        offset: z.number().int().min(0).optional(),
      },
      annotations: readOnly,
    },
    async (args) => {
      const r = searchCards(catalog, args);
      return json({ total: r.total, offset: r.offset, cards: r.cards.map(compactCard), notes: r.notes });
    },
  );

  add(
    "get_cards",
    {
      title: "Get cards",
      description:
        "Full details for cards by card number or exact name: printed text, trigger, stats, keywords, ability timings, effect kinds, and the parsed ability structure. " +
        "A name returns every card with that name (different card numbers can share a name).",
      inputSchema: {
        ids: z.array(z.string().max(20)).max(30).optional(),
        names: z.array(z.string().max(100)).max(10).optional(),
        includeAbilities: z.boolean().optional().describe("Include the parsed ability structure (default true)"),
      },
      annotations: readOnly,
    },
    async ({ ids = [], names = [], includeAbilities = true }) => {
      const found: CardRow[] = [];
      const missing: string[] = [];
      for (const raw of ids) {
        const card = catalog.cards.get(raw.trim().toUpperCase().replace(/_(?:P\d+|R\d+)$/, ""));
        if (card) found.push(card);
        else missing.push(raw);
      }
      for (const n of names) {
        const want = n.trim().toLowerCase();
        const hits = [...catalog.cards.values()].filter((c) => c.name.toLowerCase() === want);
        if (hits.length) found.push(...hits);
        else missing.push(n);
      }
      const cards = found.map((c) => ({
        ...c,
        abilities: includeAbilities ? catalog.abilities.get(c.id) : undefined,
      }));
      return json({ cards, missing });
    },
  );

  add(
    "analyze_deck",
    {
      title: "Analyze deck",
      description:
        "Load a deck (pasted list or deck planner share link) and analyze it: the card list with names, legality problems, build hints, cost curve, power curve, " +
        "counter totals, keywords, ability timings, roles (draw, search, removal, ramp, life gain), traits, expected counter and triggers in the opening hand, and searcher hit odds.",
      inputSchema: deckInput,
      annotations: { ...readOnly, openWorldHint: true },
    },
    async (args) => {
      try {
        const deck = await resolveDeck(catalog, args, fetchImpl);
        const analysis = analyzeDeck(catalog, deck);
        if (!knowledge.library) return json(analysis);
        const banList = await deckBanCheck(knowledge.library, deck);
        return json({ ...analysis, legal: analysis.legal && banList.problems.length === 0, banList });
      } catch (err) {
        return failure(err);
      }
    },
  );

  add(
    "draw_odds",
    {
      title: "Draw odds",
      description:
        "Exact odds (hypergeometric) of having seen at least N hits by each of your turns. Give a deck plus which cards count as hits " +
        "(cardIds, or kind: counter2000 / blocker / costMax with costMax / trait with trait). Without a deck, give deckSize and hits directly.",
      inputSchema: {
        ...deckInput,
        cardIds: z.array(z.string().max(20)).max(30).optional(),
        kind: z.enum(["counter2000", "blocker", "costMax", "trait"]).optional(),
        costMax: z.number().int().min(0).max(10).optional(),
        trait: z.string().max(60).optional(),
        deckSize: z.number().int().min(1).max(60).optional(),
        hits: z.number().int().min(0).max(60).optional(),
        atLeast: z.number().int().min(1).max(10).optional().describe("Default 1"),
        goingFirst: z.boolean().optional().describe("Default true"),
        mulligan: z.boolean().optional().describe("Mulligan an opening hand with no hit (default false)"),
        turns: z.number().int().min(1).max(12).optional().describe("Default 6"),
      },
      annotations: { ...readOnly, openWorldHint: true },
    },
    async ({ cardIds, kind, costMax, trait, deckSize, hits, atLeast, goingFirst, mulligan, turns, ...deck }) => {
      const q = { atLeast, goingFirst, mulligan, turns };
      try {
        if (deck.text || deck.shareLink || deck.cards?.length) {
          return json(deckDrawOdds(catalog, await resolveDeck(catalog, deck, fetchImpl), { cardIds, kind, costMax, trait }, q));
        }
        if (deckSize === undefined || hits === undefined) throw new Error("Give a deck, or deckSize and hits.");
        return json({ deckSize, hits, ...rawDrawOdds(deckSize, hits, q) });
      } catch (err) {
        return failure(err);
      }
    },
  );

  add(
    "export_deck",
    {
      title: "Export deck",
      description: "Turn a deck into list text for OPTCGSim (1xOP01-001 lines, leader first) or Limitless (4 OP01-006 lines).",
      inputSchema: { ...deckInput, format: z.enum(["optcgsim", "limitless"]).optional().describe("Default optcgsim") },
      annotations: { ...readOnly, openWorldHint: true },
    },
    async ({ format = "optcgsim", ...input }) => {
      try {
        const deck = await resolveDeck(catalog, input, fetchImpl);
        return json({ format, list: exportDeck(deck, format), deck: describeDeck(catalog, deck) });
      } catch (err) {
        return failure(err);
      }
    },
  );

  if (knowledge.library) registerOfficialTools(add, catalog, knowledge.library);
  if (knowledge.playbook) registerPlaybook(add, catalog, knowledge.playbook);
  if (knowledge.stats) {
    registerStats(add, knowledge.stats);
    registerCorpus(add, knowledge.stats);
  }
  if (personal) registerPersonalTools(add, personal);
  return tools;
}

function registerOfficialTools(add: Add, catalog: Catalog, library: OfficialLibrary) {
  const official = { readOnlyHint: true, openWorldHint: true } as const;

  add(
    "rules_lookup",
    {
      title: "Rules lookup",
      description:
        "Search the official ONE PIECE CARD GAME Comprehensive Rules by words (query) or read a numbered section with everything under it (section, e.g. 7-1 or 10-1-4). " +
        "A query also returns matching official general rules Q&A. Read live from the official site.",
      inputSchema: {
        query: z.string().max(200).optional().describe("Words to find, e.g. 'blocker once per battle' or 'deck out'"),
        section: z.string().max(20).optional().describe("Section number, e.g. 6-5-3 or 10-1-4"),
        limit: z.number().int().min(1).max(15).optional().describe("Default 6"),
      },
      annotations: official,
    },
    async (args) => {
      if (!args.query && !args.section) return failure(new Error("Give a query or a section number."));
      return json(await rulesLookup(library, args));
    },
  );

  add(
    "card_rulings",
    {
      title: "Card rulings",
      description:
        "Official rulings for cards: the Q&A answers from Bandai's FAQ for each card, rulings on other cards that mention it, any errata (before and after text), " +
        "and whether it is banned, restricted, part of a banned pair, or about to be.",
      inputSchema: { ids: z.array(z.string().max(20)).min(1).max(10).describe("Card numbers, e.g. OP14-020") },
      annotations: official,
    },
    async ({ ids }) => json(await cardRulings(library, catalog, ids)),
  );

  add(
    "ban_list",
    {
      title: "Ban list",
      description: "The official banned cards, restricted cards and banned pairs in force today, plus announced changes and the date they start.",
      inputSchema: {},
      annotations: official,
    },
    async () => json(await banListView(library, catalog)),
  );
}

function registerPlaybook(add: Add, catalog: Catalog, playbook: Playbook) {
  const currentFormat = newestFormat(catalog.cards.keys());
  add(
    "playbook",
    {
      title: "Playbook",
      description:
        "Strategy notes from the Log Pose playbook. No arguments: the list of leaders with notes and the general principles. " +
        "leader: that leader's game plan, key cards, mulligan, lines and cheese, and matchups. leader + opponent: both sides' notes on that matchup. " +
        "card: note lines that mention the card. Each note has the set it was written for, a stale flag, and whether a player reviewed it.",
      inputSchema: {
        leader: z.string().max(20).optional().describe("Leader card number"),
        opponent: z.string().max(20).optional().describe("Opponent's leader card number"),
        card: z.string().max(20).optional().describe("Card number to find in the notes"),
      },
      annotations: { readOnlyHint: true, openWorldHint: false },
    },
    async (args) => json(queryPlaybook(playbook, args, currentFormat)),
  );
}

function registerStats(add: Add, api: PlannerApi) {
  add(
    "tournament_stats",
    {
      title: "Tournament stats",
      description:
        "Results of real One Piece Card Game tournaments from Limitless TCG (play.limitlesstcg.com), recent public events with decklists and at least 8 players (aggregates, event names and decklists; no player names). Not the same data as matchup_stats, which is games on optcgduel.app: never mix the two. " +
        "No leader: meta share of every leader (its decks over all decks) and its record, plus the leaders with the best win rate among those with enough games. " +
        "leader: its meta share, its record against each opponent leader (mirrors apart; ties noted), its best placings with event, date, record and decklist, how often each card appears in its decklists, and the events covered. leader + opponent: that matchup. " +
        "Every record has games, wins, a 95% interval; under 5 games it is marked too_few_games and gives only its game count. Cite Limitless TCG.",
      inputSchema: {
        leader: z.string().max(20).optional().describe("Leader card number"),
        opponent: z.string().max(20).optional().describe("Opponent's leader card number (needs leader)"),
        days: z.number().int().min(1).max(365).optional().describe("How far back to look (default 30, the most that is kept)"),
        minPlayers: z.number().int().min(1).max(1000).optional().describe("Only events with at least this many players (default 8)"),
      },
      annotations: { readOnlyHint: true, openWorldHint: false },
    },
    async (args) => {
      try {
        return json(await tournamentStats(api, args));
      } catch (err) {
        return failure(err);
      }
    },
  );

  add(
    "matchup_stats",
    {
      title: "Matchup stats",
      description:
        "Win rates from games recorded on optcgduel.app (aggregates only, no player names or deck lists). No leader: every leader's games, play share and win rate. " +
        "leader: its overall record, its record against each opponent leader, and win rates with and without each card it plays. leader + opponent: that matchup. " +
        "Every rate has games, wins, a 95% interval and going first and second splits. Under 5 games a record is marked too_few_games and gives only its game count (wins, rates, intervals and average turns are null).",
      inputSchema: {
        leader: z.string().max(20).optional().describe("Leader card number"),
        opponent: z.string().max(20).optional().describe("Opponent's leader card number (needs leader)"),
        days: z.number().int().min(1).max(3650).optional().describe("How far back to look (default 90)"),
        rankedOnly: z.boolean().optional().describe("Only ranked games (default false)"),
      },
      annotations: { readOnlyHint: true, openWorldHint: false },
    },
    async (args) => {
      try {
        return json(await matchupStats(api, args));
      } catch (err) {
        return failure(err);
      }
    },
  );
}

function registerCorpus(add: Add, api: PlannerApi) {
  const readOnly = { readOnlyHint: true, openWorldHint: false } as const;
  add(
    "search_matches",
    {
      title: "Search matches",
      description:
        "Search every game recorded on optcgduel.app (all players who share their games, not just this one), newest first. Games are anonymized: an opaque game_id, sides A and B, " +
        "rating bands, never names. With leader, side A is that leader and result, wentFirst and card apply to it; with only opponent, side B is that leader. " +
        "Without either, card matches either deck. Use it to find example games (wins and losses of a matchup, games where a card was played) to read with replay_match.",
      inputSchema: {
        leader: z.string().max(20).optional().describe("Leader card number for side A"),
        opponent: z.string().max(20).optional().describe("Opponent's leader card number (side B)"),
        card: z.string().max(20).optional().describe("Only games where side A's deck (or either deck without a leader) has this card"),
        result: z.enum(["won", "lost"]).optional().describe("Side A won or lost (needs leader or opponent)"),
        wentFirst: z.boolean().optional().describe("Side A went first"),
        rankedOnly: z.boolean().optional(),
        days: z.number().int().min(1).max(365).optional().describe("How far back (default 90)"),
        minTurns: z.number().int().min(0).max(100).optional(),
        maxTurns: z.number().int().min(0).max(100).optional(),
        limit: z.number().int().min(1).max(50).optional().describe("Default 20"),
        offset: z.number().int().min(0).max(10000).optional(),
      },
      annotations: readOnly,
    },
    async (args) => {
      try {
        return json(await searchGames(api, args));
      } catch (err) {
        return failure(err);
      }
    },
  );

  add(
    "replay_match",
    {
      title: "Replay match",
      description:
        "Replay one game from search_matches (its game_id) turn by turn with every card named, both opening hands and the final board. " +
        "Sides are Player A and Player B as in the search. Long games are cut at maxLines; use fromTurn/toTurn to read a stretch.",
      inputSchema: {
        gameId: z.string().max(40),
        fromTurn: z.number().int().min(1).max(200).optional(),
        toTurn: z.number().int().min(1).max(200).optional(),
        maxLines: z.number().int().min(20).max(1000).optional().describe("Default 400"),
      },
      annotations: readOnly,
    },
    async ({ gameId, ...opts }) => {
      try {
        return json(await replayGame(api, gameId, opts));
      } catch (err) {
        return failure(err);
      }
    },
  );
}

function registerPersonalTools(add: Add, { api, token }: PersonalContext) {
  const readOnly = { readOnlyHint: true, openWorldHint: false } as const;

  add(
    "list_my_decks",
    {
      title: "List my decks",
      description: "The player's own decks from the deck planner: name, leader and cards. Pass a deck's leaderId and cards to analyze_deck.",
      inputSchema: {},
      annotations: readOnly,
    },
    async () => {
      try {
        return json({ decks: await listMyDecks(api, token) });
      } catch (err) {
        return failure(err);
      }
    },
  );

  add(
    "list_my_matches",
    {
      title: "List my matches",
      description:
        "The player's recent duels in the duel app, newest first: both leaders, won or lost, how it ended, turns, rating change, and whether a replay was kept (has_replay).",
      inputSchema: { limit: z.number().int().min(1).max(100).optional().describe("Default 20") },
      annotations: readOnly,
    },
    async ({ limit }) => {
      try {
        return json({ matches: await listMyMatches(api, token, limit) });
      } catch (err) {
        return failure(err);
      }
    },
  );

  add(
    "review_match",
    {
      title: "Review match",
      description:
        "Replay one of the player's duels (a match_id from list_my_matches with has_replay) and return a turn-by-turn log from their seat, " +
        "their opening hand, the result and the final board. Long games are cut at maxLines; use fromTurn/toTurn to read a stretch.",
      inputSchema: {
        matchId: z.string().max(80),
        fromTurn: z.number().int().min(1).max(200).optional(),
        toTurn: z.number().int().min(1).max(200).optional(),
        maxLines: z.number().int().min(20).max(1000).optional().describe("Default 400"),
      },
      annotations: readOnly,
    },
    async ({ matchId, ...opts }) => {
      try {
        return json(await reviewMatch(api, token, matchId, opts));
      } catch (err) {
        return failure(err);
      }
    },
  );

  const cardId = z.string().regex(/^(P-\d{3}|[A-Z]{2,4}\d{2}-\d{3})$/, "a card number like OP01-001");

  add(
    "draft_lesson",
    {
      title: "Draft lesson",
      description:
        "Save a short strategy lesson for the player to review. It stays a draft until they approve it in the duel app (Settings, Log Pose). " +
        "Cite the games it came from with matchIds (their own matches only). Ask the player before saving.",
      inputSchema: {
        text: z.string().min(10).max(1000).describe("One or two specific, actionable sentences"),
        leader: cardId.optional().describe("The leader the lesson is for"),
        opponent: cardId.optional().describe("The opponent's leader, for a matchup lesson"),
        cards: z.array(cardId).max(10).optional().describe("Cards the lesson is about"),
        matchIds: z.array(z.string().max(64)).max(10).optional().describe("match_id values from list_my_matches"),
      },
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false },
    },
    async ({ text, leader, opponent, cards, matchIds }) => {
      try {
        return json(await draftLesson(api, token, { text, leader_id: leader, opponent_id: opponent, cards, match_ids: matchIds }));
      } catch (err) {
        return failure(err);
      }
    },
  );

  add(
    "my_lessons",
    {
      title: "My lessons",
      description: "The player's own lessons: approved ones by default, or drafts waiting for review. leader narrows to lessons for that leader or against it.",
      inputSchema: {
        status: z.enum(["approved", "draft", "rejected", "all"]).optional(),
        leader: z.string().max(20).optional(),
      },
      annotations: { readOnlyHint: true, openWorldHint: false },
    },
    async ({ status, leader }) => {
      try {
        return json({ lessons: await myLessons(api, token, status, leader) });
      } catch (err) {
        return failure(err);
      }
    },
  );
}
