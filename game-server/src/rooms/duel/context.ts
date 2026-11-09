import type { Client } from "colyseus";
import type { BotLevel, Intent, MatchReplay, MatchState, Rng, Seat } from "@optcg/rules";
import type { DiceResult, ErrorCode, PlayerDeckWire } from "../../protocol.js";
import type { LogLevel } from "../../log.js";
import type { MatchProgressPayload, MatchResultPayload, SoloGamePayload } from "../../writeback.js";
import type { BotDriver } from "./bots.js";
import type { MatchClocks } from "./clocks.js";
import type { FirstSeatDice } from "./dice.js";
import type { RoomChat } from "./chat.js";
import type { RoomConfig } from "./config.js";
import type { SeatCosmetics } from "./cosmetics.js";
import type { MatchPersistence } from "./persistence.js";
import type { Rematch } from "./rematch.js";
import type { SeatRegistry } from "./seats.js";
import type { Spectators } from "./spectators.js";
import type { SyncSender } from "./sync.js";
import type { DuelTime } from "./time.js";
import type { UndoHistory } from "./undo.js";

export type SeatSlot = {
  seat: Seat;
  sessionId: string;
  /** Stable player key for logs / legacy. */
  displayId: string;
  /** Public name shown to both seats (username, else account name). */
  displayName: string;
  /** FastAPI user id when known; synthetic negative for legacy devUserId. */
  userId: number;
};

export type SpectatorSlot = {
  sessionId: string;
  displayId: string;
  userId: number;
  /** Which side is rendered as "you" in client layouts. */
  cameraSeat: Seat;
};

/** The server-side player of a "Play vs Bot" room (#631). */
export type BotSeatConfig = { level: BotLevel; rng: Rng };

export type ApplyResult = { ok: true } | { ok: false; message: string };

/** The state of the room's current game that more than one collaborator reads or writes. */
export class DuelGame {
  matchId = "";
  seed = 0;
  match: MatchState | null = null;
  /** This game's inputs, sent with the result for the backend to keep. Never sent to players. */
  replay: MatchReplay | null = null;
  ranked = true;
  matchStarted = false;
  matchOverSent = false;
  resultPending: Promise<void> | null = null;
  disposed = false;
  seatDecks: [PlayerDeckWire | null, PlayerDeckWire | null] = [null, null];
  /** Names captured at match start so they survive a seat dropping. */
  seatNames: [string | null, string | null] = [null, null];
  matchUserIds: [number, number] | null = null;
  /** The one account behind both seats of a practice (hotseat) game, else null. */
  practiceOwnerUid: number | null = null;
  endReason: string | null = null;
  /** Games played in this room (rematches); keys each result write-back. */
  gameNumber = 0;
  /** How the current game's order was decided: null = coin flip (game 1), else the rematch chooser. */
  firstSeatPickedBy: Seat | null = null;
  /** The dice roll that decided game 1's turn order (#1190); null for a coin flip and for every rematch. */
  dice: DiceResult | null = null;
  /** Set in a "Play vs Bot" room: seat 1 is played by the server (#631). */
  bot: BotSeatConfig | null = null;

  /** Rematches share the room: key each game's result separately. */
  gameKey(): string {
    return this.gameNumber > 1 ? `${this.matchId}-r${this.gameNumber - 1}` : this.matchId;
  }
}

/**
 * The body of an outgoing message: everything but `protocolVersion`, which `RoomIO.send` and
 * `broadcast` put first on every message. Type a payload as `WireBody<XMessage>` to keep it checked.
 */
export type WireBody<T extends { protocolVersion: unknown } = { protocolVersion: unknown }> = Omit<T, "protocolVersion">;

/** What the collaborators may ask of the Colyseus room itself. */
export interface RoomIO {
  /** Every connected client (players, spectators and strays). */
  allClients(): readonly Client[];
  /** Send one message to everyone, stamped with the protocol version. */
  broadcast(type: string, body: WireBody): void;
  /** Send one message to one client, stamped with the protocol version. */
  send(client: Client, type: string, body: WireBody): void;
  /** The connected client with this session id, if any. */
  clientFor(sessionId: string): Client | undefined;
  sendError(client: Client, code: ErrorCode, message: string): void;
  /** Answer a message that failed to parse (or a deck that failed to check) with its protocol error. */
  sendParseError(client: Client, error: unknown): void;
  log(level: LogLevel, event: string, data: Record<string, unknown>): void;
}

/**
 * The composition root the collaborators are handed (DuelRoom is the only implementation). A
 * collaborator types its parameter as a `Pick` of what it uses, so each one's reach is explicit.
 */
export interface DuelCore {
  readonly game: DuelGame;
  /** What shapes this room, fixed when it was created. */
  readonly config: RoomConfig;
  readonly seats: SeatRegistry;
  readonly io: RoomIO;
  readonly time: DuelTime;
  readonly clocks: MatchClocks;
  readonly undo: UndoHistory;
  readonly chat: RoomChat;
  readonly rematch: Rematch;
  readonly dice: FirstSeatDice;
  readonly spectators: Spectators;
  readonly sync: SyncSender;
  readonly cosmetics: SeatCosmetics;
  readonly bots: BotDriver;
  readonly persistence: MatchPersistence;

  /** Apply a parsed intent for `seat` and everything that follows a state change. One path for every caller. */
  applySeatIntent(seat: Seat, intent: Intent): ApplyResult;
  concedeSeat(seat: Seat): void;
  startMatch(firstSeat: Seat, pickedBy: Seat | null): void;
  /** Mirror phase / active seat / winner into the Colyseus state and tell presence. */
  syncPublicState(): void;
  maybeSendMatchOver(): void;

  /** Test seams: tests replace these on a room instance, so callers go through the room. */
  ingestSeats(): [number, number] | { skip: string };
  persistMatchProgress(matchId: string, payload: MatchProgressPayload): Promise<void>;
  persistMatchResult(payload: MatchResultPayload): Promise<void>;
  persistSoloGame(payload: SoloGamePayload): Promise<void>;
}
