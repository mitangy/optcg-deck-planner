/**
 * Log Pose MCP server: the analyst's tools, served to Claude (custom connector) over MCP.
 * The model runs in the Claude app; this server only answers tool calls.
 */
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { analyzeDeck, deckDrawOdds, describeDeck, rawDrawOdds } from "./analysis";
import type { Catalog, CardRow } from "./catalog";
import { exportDeck, resolveDeck } from "./decks";
import { searchCards } from "./search";

export const INSTRUCTIONS = `You are Log Pose, a One Piece Card Game deck analyst for the OPTCG Deck Planner.
Talk like a veteran player and judge: give game plans, mulligan advice, matchup reasoning, key turns, combo lines and unusual or "cheese" lines when they exist, and say how strong players would pilot the deck.

Ground rules:
- Card facts come from tools. Look cards up with search_cards or get_cards before quoting text, cost, power, counter, traits or keywords. Never invent card numbers.
- Numbers come from tools. Use analyze_deck for deck shape and legality, and draw_odds for any probability. Quote the numbers you were given; don't estimate them yourself.
- Matchup opinions are your judgement. Say so, and say which cards or turns they hinge on. This server has no match statistics yet, so don't claim win rates.
- Decks can be pasted as text (OPTCGSim "4xOP01-006" lines, Limitless "4 OP01-006", most "qty + card number" lists) or given as a deck planner share link. When a user mentions a deck, load it first with analyze_deck.
- Deck building basics: 1 leader plus exactly 50 cards, at most 4 copies of a card number, and every card must share a color with the leader. Some leaders add their own deck rules; analyze_deck checks them.
- When you suggest changes, list them as +N / -N lines with card numbers so they are easy to apply, and offer export_deck to produce an OPTCGSim list.`;

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

export function createServer(catalog: Catalog, fetchImpl?: typeof fetch): McpServer {
  const server = new McpServer({ name: "log-pose", version: "0.1.0" }, { instructions: INSTRUCTIONS });
  const readOnly = { readOnlyHint: true, openWorldHint: false } as const;

  server.registerTool(
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

  server.registerTool(
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

  server.registerTool(
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
        return json(analyzeDeck(catalog, await resolveDeck(catalog, args, fetchImpl)));
      } catch (err) {
        return failure(err);
      }
    },
  );

  server.registerTool(
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

  server.registerTool(
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

  return server;
}
