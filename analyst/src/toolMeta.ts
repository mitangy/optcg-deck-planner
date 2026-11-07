/**
 * What the app needs to know about each tool beyond its definition: the status line shown while it runs and the
 * adapter that turns its answer into citable sources. One entry per tool name, so adding a tool without them (or
 * naming a tool that does not exist) fails the type check instead of silently showing "Working" or no citations.
 * `add` in server.ts and the chat-only tool factories copy a tool's entry onto its `ToolDef`.
 */
import {
  adaptValue,
  analyzeDeckAdapter,
  cardRulingsAdapter,
  getCardsAdapter,
  lessonsAdapter,
  newDeckAdapter,
  oddsAdapter,
  playbookIndexAdapter,
  positionAdapter,
  priceHistoryAdapter,
  proposalAdapter,
  replayAdapter,
  reviewAdapter,
  rulesAdapter,
  searchCardsAdapter,
  searchMatchesAdapter,
  simStatsAdapter,
  simulateAdapter,
  statsAdapter,
  tournamentAdapter,
  type SourceAdapter,
  type ToolContent,
} from "./sources";

type ToolMeta = {
  /** The status line while the tool runs. */
  status: string;
  /** Turns the tool's answer into citable sources; none keeps the plain text. */
  sources?: SourceAdapter;
};

export const TOOL_META = {
  search_cards: { status: "Searching cards", sources: searchCardsAdapter },
  get_cards: { status: "Reading card text", sources: getCardsAdapter },
  analyze_deck: { status: "Analyzing the deck", sources: analyzeDeckAdapter },
  draw_odds: { status: "Working out draw odds", sources: oddsAdapter },
  simulate: { status: "Running goldfish games", sources: simulateAdapter },
  export_deck: { status: "Exporting the list" },
  rules_lookup: { status: "Checking the rules", sources: rulesAdapter },
  card_rulings: { status: "Checking rulings", sources: cardRulingsAdapter },
  ban_list: { status: "Checking the ban list" },
  playbook: { status: "Reading the playbook", sources: playbookIndexAdapter },
  matchup_stats: { status: "Pulling win rates", sources: statsAdapter },
  tournament_stats: { status: "Pulling tournament results", sources: tournamentAdapter },
  price_history: { status: "Checking price history", sources: priceHistoryAdapter },
  search_matches: { status: "Searching recorded games", sources: searchMatchesAdapter },
  sim_stats: { status: "Pulling bot-simulation results", sources: simStatsAdapter },
  analyze_position: { status: "Analyzing the position", sources: positionAdapter },
  replay_match: { status: "Replaying a game", sources: replayAdapter },
  list_my_decks: { status: "Reading your decks" },
  list_my_matches: { status: "Reading your match history" },
  // These two never had a label of their own, so the app showed the generic one.
  list_my_sim_games: { status: "Working" },
  review_sim_game: { status: "Working" },
  review_match: { status: "Replaying your game", sources: reviewAdapter },
  draft_lesson: { status: "Saving a lesson draft" },
  my_lessons: { status: "Reading your lessons", sources: lessonsAdapter },
  propose_deck_edit: { status: "Checking the suggested change", sources: proposalAdapter },
  propose_new_deck: { status: "Checking the new deck", sources: newDeckAdapter },
  propose_turn_plan: { status: "Checking the turn plan" },
  answer_choice: { status: "Answering the prompt" },
} satisfies Record<string, ToolMeta>;

export type ToolName = keyof typeof TOOL_META;

/** The status line and citation adapter of a tool. */
export const metaFor = (name: ToolName): ToolMeta => TOOL_META[name];

/** A tool's answer value as citable tool_result content, or null to keep the plain text. */
export function adaptToolResult(tool: ToolName, value: unknown): ToolContent[] | null {
  return adaptValue((TOOL_META[tool] as ToolMeta).sources, tool, value);
}
