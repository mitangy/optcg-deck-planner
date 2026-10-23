/** Rules puzzles (#677): one position, one question, one answer the duel engine decides. */

export const PUZZLE_TYPES = ["power", "counter_needed", "playable", "can_attack", "scenario"] as const;
export type PuzzleType = (typeof PUZZLE_TYPES)[number];

/**
 * The right answer. `key` is the field of the model's JSON answer. A number is compared exactly; a "set" is a list of
 * distinct card ids whose order and repeats do not matter; a "multiset" keeps repeats (two copies in a hand are two entries).
 */
export type Gold = { key: string; mode: "number"; value: number } | { key: string; mode: "set" | "multiset"; value: string[] };

export type Puzzle = {
  id: string;
  type: PuzzleType;
  /** What kind of position this is, for the report: e.g. "buffed", "idle-don", "plain", "synthetic", "selfplay". */
  tags: string[];
  /** A card from OP18 or EB05 is on a board, in the acting hand or in the scenario. */
  newSet: boolean;
  /** Where the position came from: "selfplay seed 12 intent 40", "harness", "scenario <file>". */
  source: string;
  /** Both boards, the acting player's hand and the card reference block. */
  position: string;
  /** Card numbers the position mentions; the grader reads card names in an answer against these. */
  cards: string[];
  question: string;
  /** The answer format the model is asked to end with, e.g. {"power": <number>}. */
  schema: string;
  /** Exactly what the model is sent as the player's message. */
  message: string;
  gold: Gold;
};

export type ParsedAnswer = { ok: true; value: unknown; raw: string } | { ok: false; reason: string };

/**
 * The longest message a puzzle may be. The chat route caps a typed message at 4000 characters (`chatBody.message`), but a live
 * game goes to the model as its own <game> block in the same user message (`gameContextBlock` in src/chat.ts), which that cap
 * does not cover; a puzzle position is the same kind of text. This bound only keeps the cost of one puzzle in check.
 */
export const MESSAGE_LIMIT = 8000;

export const NEW_SET = /^(OP18|EB05)-/;
