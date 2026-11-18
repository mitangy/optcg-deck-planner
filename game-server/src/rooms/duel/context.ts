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
  displayId: string;
  displayName: string;
  userId: number;
};

export type SpectatorSlot = {
  sessionId: string;
  displayId: string;
  userId: number;
  cameraSeat: Seat;
};

export type BotSeatConfig = { level: BotLevel; rng: Rng };

export type ApplyResult = { ok: true } | { ok: false; message: string };

export class DuelGame {
  matchId = "";
  seed = 0;
  /** Secret 256-bit key of the running game, absent for a pinned-seed room. Never sent to players. */
  rngKey: string | null = null;
  private currentMatch: MatchState | null = null;
  /** Rises on every match change (intent, timer, concede, undo); never reset, so undo cannot make an old step look current. */
  stateStep = 0;
  get match(): MatchState | null {
    return this.currentMatch;
  }
  set match(next: MatchState | null) {
    this.currentMatch = next;
    this.stateStep += 1;
  }
  /** Never sent to players. */
  replay: MatchReplay | null = null;
  ranked = true;
  tournament = false;
  matchStarted = false;
  matchOverSent = false;
  disposed = false;
  seatDecks: [PlayerDeckWire | null, PlayerDeckWire | null] = [null, null];
  /** Names captured at match start so they survive a seat dropping. */
  seatNames: [string | null, string | null] = [null, null];
  matchUserIds: [number, number] | null = null;
  practiceOwnerUid: number | null = null;
  endReason: string | null = null;
  gameNumber = 0;
  firstSeatPickedBy: Seat | null = null;
  dice: DiceResult | null = null;
  bot: BotSeatConfig | null = null;

  /** Ranked and tournament games share the rules that stop information leaking to a player: no spectator hands, no undo. */
  get competitive(): boolean {
    return this.ranked || this.tournament;
  }

  gameKey(): string {
    return this.gameNumber > 1 ? `${this.matchId}-r${this.gameNumber - 1}` : this.matchId;
  }
}

export type WireBody<T extends { protocolVersion: unknown } = { protocolVersion: unknown }> = Omit<T, "protocolVersion">;

export interface RoomIO {
  allClients(): readonly Client[];
  broadcast(type: string, body: WireBody): void;
  send(client: Client, type: string, body: WireBody): void;
  clientFor(sessionId: string): Client | undefined;
  sendError(client: Client, code: ErrorCode, message: string): void;
  sendParseError(client: Client, error: unknown): void;
  log(level: LogLevel, event: string, data: Record<string, unknown>): void;
}

export interface DuelCore {
  readonly game: DuelGame;
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

  applySeatIntent(seat: Seat, intent: Intent): ApplyResult;
  concedeSeat(seat: Seat): void;
  endGameOutsideRules(winner: Seat, reason: string): void;
  startMatch(firstSeat: Seat, pickedBy: Seat | null): void;
  syncPublicState(): void;
  maybeSendMatchOver(): void;

  /** Test seams: tests replace these on a room instance, so callers go through the room. */
  ingestSeats(): [number, number] | { skip: string };
  persistMatchProgress(matchId: string, payload: MatchProgressPayload): Promise<void>;
  persistMatchResult(payload: MatchResultPayload): Promise<void>;
  persistSoloGame(payload: SoloGamePayload): Promise<void>;
}
