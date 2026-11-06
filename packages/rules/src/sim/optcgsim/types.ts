/**
 * Types for the OPTCGSim combat-log reader (issue #1030, step 1).
 *
 * Pure data only. Real player names must never be stored in fixtures: tests use
 * `PlayerA#1` / `PlayerB#2`. Names are normalized by stripping U+200B.
 */

/** "me" is the recording player (the JSON `playerName`); "opp" is the other side. */
export type SimSide = "me" | "opp";

/** One element of the Card Kaizoku `/matches` JSON array (fields we read). */
export interface SimMatchRecord {
  GameMode?: number;
  coinflip?: boolean;
  date?: string;
  decklist?: string[];
  oppDecklist?: string[];
  isPrivate?: boolean;
  matchKey?: string;
  oppLeader?: string;
  oppLeaderName?: string;
  oppPlayerName?: string;
  oppStartingHand?: string[];
  playerLeader?: string;
  playerLeaderName?: string;
  playerName?: string;
  result?: string;
  startingHand?: string[];
  turnNumber?: number;
  /**
   * Verified against "Chose to go First/Second" lines in all 111 logs of the 2026-11-06 export:
   * 0 = the recording player (`me`) went FIRST, 1 = `me` went SECOND.
   * (`coinflip` true means `me` won the flip and chose the order; false means the opponent chose.)
   */
  turnOrder?: number;
  combatLog?: string | null;
}

export interface SimCardCount {
  id: string;
  count: number;
}

export interface SimPlayer {
  side: SimSide;
  name: string;
  /** RZ1 owner number (1 or 2) in this log, or null when the log has no PLY line for the player. */
  owner: 1 | 2 | null;
  leaderId: string | null;
  leaderName: string | null;
  decklist: SimCardCount[];
  startingHand: SimCardCount[];
  /** Took a mulligan (a "Mulligan" line from this player). */
  mulligan: boolean;
}

export interface SimCharacterSnapshot {
  slot: number;
  id: string;
  rested: boolean;
  powerDelta: number;
  attachedDon: number;
}

export interface SimBoardSnapshot {
  leader: { id: string | null; attachedDon: number; rested: boolean };
  characters: SimCharacterSnapshot[];
  stage: string | null;
  lifeCount: number;
  handCount: number;
  /**
   * Hand ids the recording player could know: all of `me`'s hand; for `opp` only cards that went
   * public before entering the hand (returned from the character area, stage or trash). Cards the
   * opponent drew face down are NOT listed even though the raw log prints their ids.
   */
  knownHandIds: string[];
  donActive: number;
  donRested: number;
  donDeckCount: number;
  deckCount: number;
  trashIds: string[];
}

export interface SimSnapshot {
  me: SimBoardSnapshot;
  opp: SimBoardSnapshot;
}

export type SimEvent =
  | { kind: "setup"; side: SimSide | null; what: "leader" | "chooseOrder" | "mulligan"; detail?: string }
  | { kind: "draw"; side: SimSide; count: number }
  | { kind: "drawDon"; side: SimSide; count: number }
  | { kind: "play"; side: SimSide; cardId: string; name: string; zone: "character" | "stage" | "unknown" }
  | { kind: "attachDon"; side: SimSide; targetId: string; count: number; total: number }
  | { kind: "attack"; side: SimSide; attackerId: string; targetId: string }
  | { kind: "battle"; attackerId: string; attackerPower: number; targetId: string; targetPower: number }
  | { kind: "block"; side: SimSide; blockerId: string }
  | { kind: "counter"; side: SimSide; cardId: string | null; value: number | null; via: "discard" | "effect" }
  | { kind: "damage"; sourceId: string; amount: number }
  | { kind: "attackFails" }
  | { kind: "lifeTaken"; side: SimSide; cardId: string; to: "hand" | "trash" | "other" }
  | { kind: "ko"; side: SimSide; cardId: string }
  | { kind: "trash"; side: SimSide; cardId: string; from: "hand" | "character" | "stage" | "life" | "deck" | "other" }
  | { kind: "effect"; side: SimSide | null; sourceId: string; text: string }
  | { kind: "endTurn"; side: SimSide }
  | { kind: "info"; side: SimSide | null; text: string }
  | { kind: "result"; side: SimSide | null; what: "wins" | "loses" | "concedes" | "quits" | "timeout" }
  | { kind: "unknown"; text: string };

export type SimEventKind = SimEvent["kind"];

export interface SimTurn {
  /** 1-based turn number (each player's turn counts; turn 1 = first player's first turn). */
  number: number;
  active: SimSide;
  /** Both boards after refresh/draw/DON phases of this turn (first moment the active player can act). */
  snapshot: SimSnapshot;
  events: SimEvent[];
}

export interface SimChkMismatch {
  seq: number;
  side: SimSide;
  field: string;
  expected: number;
  actual: number;
}

export interface SimGame {
  me: SimPlayer;
  opp: SimPlayer;
  players: [SimPlayer, SimPlayer];
  /** Who went first (from the "Chose to go ..." line; falls back to `turnOrder`). */
  firstPlayer: SimSide;
  /** Raw JSON turnOrder: 0 = me first, 1 = me second. */
  turnOrder: number | null;
  /** Winner from the JSON `result` (the log can end mid-game); null when the result is missing. */
  winner: SimSide | null;
  date: string | null;
  simVersion: string | null;
  turns: SimTurn[];
  /** Events before turn 1 starts (leaders, order choice, mulligans). */
  preEvents: SimEvent[];
  /** Text lines nothing matched (also present as `unknown` events). */
  unknownLines: string[];
  chkChecked: number;
  chkMismatches: SimChkMismatch[];
}

export interface SimParseReport {
  gamesInput: number;
  gamesParsed: number;
  gamesSkippedNoLog: number;
  turns: number;
  eventsByKind: Partial<Record<SimEventKind, number>>;
  unknownLineCount: number;
  /** Top unknown line patterns (digits and card ids collapsed), most common first. */
  unknownPatterns: { pattern: string; count: number; example: string }[];
  chkChecked: number;
  chkMismatchCount: number;
  chkMismatchGames: number;
  chkMismatchSamples: { game: number; mismatch: SimChkMismatch }[];
}
