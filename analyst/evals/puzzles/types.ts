export const PUZZLE_TYPES = ["power", "counter_needed", "playable", "can_attack", "scenario", "defend", "lethal", "scenario_chain"] as const;
export type PuzzleType = (typeof PUZZLE_TYPES)[number];

export type Gold = { key: string; mode: "number"; value: number } | { key: string; mode: "set" | "multiset"; value: string[] } | { key: string; mode: "all"; parts: Gold[] };

export type Puzzle = {
  id: string;
  type: PuzzleType;
  tags: string[];
  newSet: boolean;
  source: string;
  position: string;
  cards: string[];
  question: string;
  schema: string;
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
