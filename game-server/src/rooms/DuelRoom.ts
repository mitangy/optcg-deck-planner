import { Room, Client } from "colyseus";
import {
  applyIntent,
  buildTestDeck,
  createMatch,
  DEFAULT_LEADER_ID,
  MATCH_REPLAY_SCHEMA,
  REGISTRY_HASH,
  RULES_VERSION,
  skipMulligans,
  type Intent,
  type MatchState,
  type Seat,
} from "@optcg/rules";
import { sanitizeDisplayName, verifyGameToken } from "../gameToken.js";
import { writeLog, type LogLevel } from "../log.js";
import { SlidingWindowLimiter } from "../rateLimit.js";
import { checkMatchmakeToken, claimCreatorRoom, releaseCreatorRoom } from "../matchmakeGuard.js";
import { assertKnownDeck, rankedDeckProblem } from "../rankedDeck.js";
import {
  PROTOCOL_VERSION,
  TAKEN_OVER_CLOSE_CODE,
  parseCreateOptions,
  parseIntentMessage,
  parseJoinOptions,
  CLIENT_MESSAGE,
  ProtocolError,
  errorCodeOf,
  type ErrorCode,
  type PlayerDeckWire,
} from "../protocol.js";
import {
  postMatchProgress,
  postMatchResult,
  postSoloGame,
  type MatchProgressPayload,
  type MatchResultPayload,
  type SoloGamePayload,
} from "../writeback.js";
import { presence, type PresenceEntry, type PresenceSource } from "../presence.js";
import { DuelPublicState } from "./schema/DuelPublicState.js";
import { BOT_SEAT, BOT_USER_ID, BotDriver } from "./duel/bots.js";
import { RoomChat } from "./duel/chat.js";
import { MatchClocks } from "./duel/clocks.js";
import { buildRoomConfig, type RoomConfig } from "./duel/config.js";
import { DuelGame, type ApplyResult, type DuelCore, type RoomIO } from "./duel/context.js";
import { SeatCosmetics } from "./duel/cosmetics.js";
import { MatchPersistence } from "./duel/persistence.js";
import { FirstSeatDice } from "./duel/dice.js";
import { Rematch } from "./duel/rematch.js";
import { SeatRegistry } from "./duel/seats.js";
import { MAX_SPECTATORS, Spectators } from "./duel/spectators.js";
import { SyncSender } from "./duel/sync.js";
import { duelTimeSource, realTime, type DuelTime } from "./duel/time.js";
import { UndoHistory, type UndoSnapshot } from "./duel/undo.js";

export { BOT_MAX_INTENTS_PER_TURN, botDisplayName, botPacing, botSearch } from "./duel/bots.js";

const INTENT_RATE_LIMIT = 20;
const INTENT_RATE_WINDOW_MS = 1000;
/** Any message type, per client: more than this in one second drops the client (intents alone allow 20). */
const MAX_MESSAGES_PER_SECOND = 40;

/**
 * One duel: a Colyseus room that owns the lifecycle (create, join, takeover, leave, drop, dispose),
 * message routing and the game's start and end. Everything else lives in the collaborators under
 * `./duel/`, which share `game` (the current game's state) and reach each other through `this`.
 */
export class DuelRoom extends Room implements PresenceSource, DuelCore {
  maxClients = 2 + MAX_SPECTATORS;
  maxMessagesPerSecond = MAX_MESSAGES_PER_SECOND;
  state = new DuelPublicState();

  /** Matchmake-time token check (see checkMatchmakeToken); the instance onAuth then seats the client. */
  static async onAuth(_token: string, options: unknown): Promise<unknown> {
    return checkMatchmakeToken(options);
  }

  readonly game = new DuelGame();
  readonly seats = new SeatRegistry();
  private roomConfig: RoomConfig | null = null;
  /** Wall clock, timers and sleeping; real unless a test installed `duelTimeSource.create`. */
  readonly time: DuelTime = duelTimeSource.create?.(this) ?? realTime(this);
  readonly io: RoomIO = {
    allClients: () => this.clients,
    broadcast: (type, body) => this.broadcast(type, { protocolVersion: PROTOCOL_VERSION, ...body }),
    send: (client, type, body) => client.send(type, { protocolVersion: PROTOCOL_VERSION, ...body }),
    clientFor: (sessionId) => this.clients.find((c) => c.sessionId === sessionId),
    sendError: (client, code, message) => this.sendError(client, code, message),
    sendParseError: (client, error) => this.sendError(client, errorCodeOf(error, "bad_protocol"), (error as Error).message),
    log: (level, event, data) => this.log(level, event, data),
  };
  readonly clocks: MatchClocks = new MatchClocks(this);
  readonly undo: UndoHistory = new UndoHistory(this);
  readonly chat: RoomChat = new RoomChat(this);
  readonly rematch: Rematch = new Rematch(this);
  readonly dice: FirstSeatDice = new FirstSeatDice(this);
  readonly spectators: Spectators = new Spectators(this);
  readonly sync: SyncSender = new SyncSender(this);
  readonly cosmetics: SeatCosmetics = new SeatCosmetics(this);
  readonly bots: BotDriver = new BotDriver(this);
  readonly persistence: MatchPersistence = new MatchPersistence(this);
  private readonly intentLimiter = new SlidingWindowLimiter(INTENT_RATE_LIMIT, INTENT_RATE_WINDOW_MS, () => this.time.now());

  /** Account that created this room, counted against its open-room cap until dispose. */
  private creatorUid: number | null = null;

  private lastMetadataKey = "";
  private stopTakedowns: (() => void) | null = null;

  /** What shapes this room, built once in onCreate from the create options and the environment. */
  get config(): RoomConfig {
    if (!this.roomConfig) throw new Error("Room config is read in onCreate");
    return this.roomConfig;
  }

  async onCreate(options: unknown) {
    const parsed = parseCreateOptions(options);
    const config = buildRoomConfig(options, parsed);
    this.roomConfig = config;
    // Free-tier cold starts need >15s between matchmake HTTP and WS consume.
    this.seatReservationTimeout = config.seatReservationSeconds;
    this.creatorUid = await claimCreatorRoom(options);
    try {
      this.setUpRoom(config);
    } catch (e) {
      // A room whose onCreate throws is never registered and never disposed,
      // so onDispose would never give this slot back.
      releaseCreatorRoom(this.creatorUid);
      this.creatorUid = null;
      throw e;
    }
  }

  private setUpRoom(config: RoomConfig) {
    const { game } = this;
    // Rooms are joined by id only (create, invites, the ranked matchmaker), so a
    // stranger's id-less matchmake join can never land in, or fill, someone's room.
    void this.setPrivate(true);
    game.seed = config.seed;
    if (config.players) {
      for (const deck of config.players) assertKnownDeck(deck);
    }
    // Ranked checks use the request's own flag: a forged one is rejected for its decks too.
    if (config.requestedRanked && config.players) {
      for (const deck of config.players) {
        const problem = rankedDeckProblem(deck);
        if (problem) throw new Error(problem);
      }
    }
    if (config.players) {
      game.seatDecks = [config.players[0], config.players[1]];
    }
    // config.ranked already ignores a browser-provided `ranked: true`: only the in-process
    // matchmaker can supply the server-only capability needed for Elo matches.
    game.ranked = config.ranked;
    this.clocks.configure(config.timer);
    if (config.seatUserIds) {
      // A paired ranked room: if one player never makes it in (deck turned
      // away, closed the tab), don't leave the other on "Waiting" forever.
      this.time.setTimeout(() => this.expireNoShow(), config.rankedNoShowSeconds * 1000);
    }
    game.matchId = this.roomId;
    this.state.matchId = game.matchId;
    this.state.seatsFilled = 0;
    this.state.phase = "waiting";
    this.state.activeSeat = 0;
    this.state.winner = -1;
    this.state.protocolVersion = PROTOCOL_VERSION;
    if (config.bot) {
      this.bots.seatBot(config.bot);
      this.state.seatsFilled = 1;
    }

    this.onMessage(CLIENT_MESSAGE.intent, (client, message) => {
      this.handleIntent(client, message);
    });

    this.onMessage(CLIENT_MESSAGE.concede, (client) => {
      this.handleConcede(client);
    });

    this.onMessage(CLIENT_MESSAGE.sync, (client) => {
      this.sendSync(client);
    });

    this.onMessage(CLIENT_MESSAGE.ping, (client, message) => {
      const t =
        message && typeof message === "object"
          ? (message as { t?: number }).t
          : undefined;
      client.send("pong", { t });
    });

    this.onMessage(CLIENT_MESSAGE.skin, (client, message) => {
      const seat = this.requireSeat(client, "Spectators cannot set cosmetics", "No seat for cosmetics");
      if (seat !== null) this.cosmetics.handleSkin(client, seat, message);
    });
    this.onMessage(CLIENT_MESSAGE.cosmetics, (client, message) => {
      const seat = this.requireSeat(client, "Spectators cannot set cosmetics");
      if (seat !== null) this.cosmetics.handleCosmetics(client, seat, message);
    });

    this.onMessage(CLIENT_MESSAGE.chat, (client, message) => {
      const seat = this.requireSeat(client, "Spectators cannot chat");
      if (seat !== null) this.chat.handle(client, seat, message);
    });

    this.onMessage(CLIENT_MESSAGE.hand_order, (client, message) => {
      const seat = this.requireSeat(client, "Spectators cannot set a hand order");
      if (seat !== null) this.spectators.handleHandOrder(client, seat, message);
    });

    this.onMessage(CLIENT_MESSAGE.undo, (client, message) => {
      const seat = this.requireSeat(client, "Spectators cannot undo");
      if (seat !== null) this.undo.handle(client, seat, message);
    });

    this.onMessage(CLIENT_MESSAGE.rematch, (client, message) => {
      const seat = this.requireSeat(client, "Spectators cannot request a rematch");
      if (seat !== null) this.rematch.handle(client, seat, message);
    });

    this.onMessage(CLIENT_MESSAGE.dice, (client, message) => {
      const seat = this.requireSeat(client, "Spectators cannot roll the dice");
      if (seat !== null) this.dice.handle(client, seat, message);
    });

    presence.register(this);
    this.stopTakedowns = presence.onTakedowns((list) => this.cosmetics.applyTakedowns(list));
    this.log("info", "room_created", {
      matchId: game.matchId,
      seed: game.seed,
      ranked: game.ranked,
      ...this.clocks.limits,
      ...(game.bot ? { bot: game.bot.level } : {}),
    });
  }

  async onDispose() {
    this.game.disposed = true;
    this.bots.clearTimer();
    this.dice.clearTimers();
    releaseCreatorRoom(this.creatorUid);
    this.creatorUid = null;
    presence.unregister(this);
    this.stopTakedowns?.();
    this.stopTakedowns = null;
    this.clocks.clearTimerLoop();
    this.log("info", "room_disposed", { matchId: this.game.matchId });
    // A game closing without a result keeps its log up to the last action.
    if (this.game.matchStarted && !this.game.matchOverSent && !this.game.resultPending) {
      await this.persistence.saveProgress(true);
    }
  }

  async onBeforeShutdown() {
    // Do not dispose a completed match before its result is durably queued.
    await this.game.resultPending;
    super.onBeforeShutdown();
  }

  onAuth(client: Client, options: unknown) {
    try {
      return this.resolveIdentity(options);
    } catch (e) {
      const err = e as Error;
      this.log("warn", "join_rejected", {
        matchId: this.game.matchId,
        sessionId: client.sessionId,
        code: errorCodeOf(e, "bad_protocol"),
        message: err.message,
      });
      throw e;
    }
  }

  /** Ranked: the paired opponent never claimed their seat, so close the room. */
  private expireNoShow() {
    const { game } = this;
    if (game.matchStarted) return;
    // Mid-roll: not a no-show yet. Check again later, because a seat leaving cancels the roll and
    // would otherwise leave the room waiting with no timer (#1206).
    if (this.dice.active) {
      this.time.setTimeout(() => this.expireNoShow(), this.config.rankedNoShowSeconds * 1000);
      return;
    }
    this.log("warn", "opponent_no_show", {
      matchId: game.matchId,
      seats: [this.seats.slot(0)?.userId ?? null, this.seats.slot(1)?.userId ?? null],
    });
    for (const client of this.clients) {
      this.sendError(
        client,
        "opponent_no_show",
        "Your opponent didn't join the match. Queue again to find a new one.",
      );
    }
    void this.disconnect();
  }

  onJoin(client: Client, options: unknown) {
    const { game } = this;
    let identity: {
      displayId: string;
      displayName: string;
      userId: number;
      preferredSeat?: Seat;
      role: "player" | "spectator";
      deck?: PlayerDeckWire;
      takeover: boolean;
      ownerUid: number | null;
    };
    try {
      identity = this.resolveIdentity(options);
    } catch (e) {
      const err = e as Error;
      this.rejectJoin(client, errorCodeOf(e, "bad_protocol"), err.message);
      return;
    }

    let reservedSeat: Seat | null = null;
    try {
      reservedSeat = this.reservedSeatFor(identity);
    } catch (e) {
      const err = e as Error;
      this.rejectJoin(client, errorCodeOf(e, "unauthorized"), err.message);
      return;
    }

    // Reclaim after allowReconnection: same sessionId may already be seated.
    const existingSeat = this.seats.seatForClient(client);
    if (existingSeat !== null) {
      const slot = this.seats.slot(existingSeat);
      if (
        !slot ||
        slot.userId !== identity.userId ||
        (reservedSeat !== null && reservedSeat !== existingSeat)
      ) {
        this.rejectJoin(client, "unauthorized", "Identity does not own this seat");
        return;
      }
      this.log("info", "player_reconnected", {
        matchId: game.matchId,
        seat: existingSeat,
        sessionId: client.sessionId,
      });
      this.sendSync(client);
      return;
    }

    if (identity.takeover && identity.role === "player") {
      this.takeOverSeat(client, identity);
      return;
    }

    if (identity.role === "spectator") {
      const cameraSeat: Seat =
        identity.preferredSeat === 0 || identity.preferredSeat === 1
          ? identity.preferredSeat
          : 0;
      if (!this.spectators.join(client, { displayId: identity.displayId, userId: identity.userId, cameraSeat })) {
        this.rejectJoin(client, "room_full", "Spectator cap reached");
        return;
      }
      if (game.matchStarted && game.match) {
        this.sync.sendSpectatorSync(client, cameraSeat);
      } else if (!this.dice.sendState(client)) {
        this.sendError(client, "match_not_ready", "Waiting for duel to start");
      }
      return;
    }

    // Once a match has started its seats are fixed: a vacated seat can only be
    // reclaimed through allowReconnection (handled above), never by a new join.
    // Otherwise anyone with the room id could take over after a Leave, read
    // the leaver's hand and cancel the forfeit.
    if (game.matchStarted || this.dice.active) {
      this.rejectJoin(client, "room_full", "Match already in progress");
      return;
    }

    if (game.ranked && identity.deck) {
      const problem = rankedDeckProblem(identity.deck);
      if (problem) {
        this.rejectJoin(client, "unsupported_deck", problem);
        return;
      }
    }

    if (reservedSeat !== null && this.seats.slot(reservedSeat)) {
      this.rejectJoin(client, "room_full", "Reserved seat is already occupied");
      return;
    }
    const claim = {
      sessionId: client.sessionId,
      displayId: identity.displayId,
      displayName: identity.displayName,
      userId: identity.userId,
    };
    let seat: Seat | null;
    if (reservedSeat !== null) {
      this.seats.occupy(reservedSeat, claim);
      seat = reservedSeat;
    } else {
      seat = this.seats.assign(claim, identity.preferredSeat);
    }
    if (seat === null) {
      this.rejectJoin(client, "room_full", "No free seat");
      return;
    }

    if (identity.deck) {
      game.seatDecks[seat] = identity.deck;
    }
    this.seats.setOwner(seat, identity.ownerUid ?? identity.userId);

    this.state.seatsFilled = this.seats.filled();
    presence.markDirty();
    this.log("info", "player_joined", {
      matchId: game.matchId,
      seat,
      displayId: identity.displayId,
      userId: identity.userId,
      sessionId: client.sessionId,
      hasDeck: Boolean(identity.deck),
    });

    if (this.seats.bothFilled() && !game.matchStarted) {
      // Game 1's order is a dice roll when the room asks for one, else the coin flip made at create.
      if (!this.dice.begin()) this.startMatch(this.config.firstSeat, null);
    } else if (game.matchStarted && game.match) {
      this.sendSync(client);
    }
    this.refreshMetadata();
  }

  /**
   * Move a seat to this connection (#451). Only the account that controls the seat
   * may do it; identity, deck and clocks stay as they were, so nothing is
   * written back differently and the opponent never sees a leave.
   */
  private takeOverSeat(
    client: Client,
    identity: { userId: number; preferredSeat?: Seat },
  ) {
    const { game } = this;
    const seat = identity.preferredSeat;
    if (seat !== 0 && seat !== 1) {
      this.rejectJoin(client, "bad_protocol", "takeover needs a preferredSeat");
      return;
    }
    if (this.seats.controllerOf(seat) !== identity.userId) {
      this.rejectJoin(client, "unauthorized", "You don't hold a seat in this match");
      return;
    }
    if (game.matchOverSent) {
      this.rejectJoin(client, "match_over", "That match has ended");
      return;
    }
    const oldSessionId = this.seats.moveTo(seat, client.sessionId);
    this.intentLimiter.forget(oldSessionId);
    this.chat.forget(oldSessionId);
    // A seat dropped mid-grace: kill the pending reclaim so the old socket's
    // reconnection token can never take the seat back from this one.
    const pending = (
      this as unknown as {
        _reconnections: Record<string, [string, { reject(reason?: unknown): void }]>;
      }
    )._reconnections;
    for (const entry of Object.values(pending)) {
      if (entry[0] === oldSessionId) entry[1].reject(false);
    }
    const old = this.io.clientFor(oldSessionId);
    if (old) {
      this.io.send(old, "taken_over", { seat });
      old.leave(TAKEN_OVER_CLOSE_CODE);
    }
    this.broadcastPresence();
    presence.markDirty();
    this.log("info", "player_taken_over", {
      matchId: game.matchId,
      seat,
      oldSessionId,
      sessionId: client.sessionId,
    });
    if (this.dice.active) this.sendSync(client);
    if (game.matchStarted && game.match) this.sendSync(client);
    this.refreshMetadata();
  }

  /** Lobby lookup data (GET /active-matches): who holds the seats and how far along the room is. */
  refreshMetadata() {
    const { game } = this;
    const phase = game.matchOverSent ? "finished" : game.matchStarted ? "playing" : "waiting";
    const metadata = { owners: this.seats.owners(), phase, ranked: game.ranked };
    const key = JSON.stringify(metadata);
    if (key === this.lastMetadataKey) return;
    this.lastMetadataKey = key;
    void this.setMetadata(metadata).catch(() => undefined);
  }

  /** Consented leave (CloseCode.CONSENTED) — no reclaim. */
  onLeave(client: Client, _code?: number) {
    if (this.spectators.forClient(client)) {
      this.spectators.remove(client.sessionId);
      return;
    }
    const seat = this.seats.seatForClient(client);
    if (seat === null) return;
    this.clearSeat(client.sessionId);
    this.rematch.broadcast();
    // Leaving a live match forfeits it, so the other player isn't stranded.
    // The short delay lets a practice match (both seats leaving together)
    // simply dispose instead of recording a result.
    this.time.setTimeout(() => this.forfeitAbsentSeat(seat, "abandoned"), 1500);
  }

  /** End a live match for a seat that is gone for good (left / reclaim timed out). */
  private forfeitAbsentSeat(seat: Seat, reason: "abandoned" | "disconnect") {
    const { game } = this;
    if (!game.match || !game.matchStarted || game.matchOverSent) return;
    if (game.match.winner !== null || game.match.phase === "game_over") return;
    if (this.seats.slot(seat)) return; // came back
    const other = (seat === 0 ? 1 : 0) as Seat;
    if (!this.seats.slot(other)) return; // nobody left to hand the win to
    game.endReason = reason;
    game.match = { ...game.match, winner: other, winReason: "leader_battle_at_zero_life", phase: "game_over" };
    this.seats.clearAway();
    this.undo.request = null;
    this.syncPublicState();
    this.spectators.broadcastViews([]);
    this.clocks.stopSeatClock();
    this.clocks.clearTimerLoop();
    this.clocks.broadcastTimer();
    this.undo.broadcastState();
    this.broadcastPresence();
    this.log("info", "forfeit_absent", { matchId: game.matchId, seat, reason, winner: other });
    this.maybeSendMatchOver();
  }

  /**
   * Unexpected disconnect — offer seat reclaim for RECONNECT_GRACE_SECONDS.
   * Colyseus 0.18 routes drops here when `onDrop` is defined.
   */
  async onDrop(client: Client, _code?: number) {
    const { game } = this;
    if (this.spectators.forClient(client)) {
      this.spectators.remove(client.sessionId);
      return;
    }
    const seat = this.seats.seatForClient(client);
    if (seat === null) return;

    // Still allow reclaim before the match starts (hotseat StrictMode / refresh
    // during the seat-1 join window). Only skip once the match is over.
    if (game.matchOverSent) {
      this.clearSeat(client.sessionId);
      return;
    }

    const grace = this.config.reconnectGraceSeconds;
    this.log("info", "player_disconnected", {
      matchId: game.matchId,
      seat,
      graceSeconds: grace,
    });
    this.seats.markAway(seat, this.time.now() + grace * 1000);
    this.broadcastPresence();
    try {
      await this.allowReconnection(client, grace);
      this.log("info", "player_reclaim_ok", {
        matchId: game.matchId,
        seat,
        sessionId: client.sessionId,
      });
      this.seats.markBack(seat);
      this.broadcastPresence();
      this.sendSync(client);
    } catch {
      // Another device took the seat over: it is theirs now, not ours to free or forfeit.
      if (this.seats.slot(seat)?.sessionId !== client.sessionId) return;
      this.log("info", "player_reclaim_timeout", {
        matchId: game.matchId,
        seat,
      });
      this.seats.markBack(seat);
      this.clearSeat(client.sessionId);
      this.broadcastPresence();
      this.forfeitAbsentSeat(seat, "disconnect");
    }
  }

  private resolveIdentity(options: unknown): {
    displayId: string;
    displayName: string;
    userId: number;
    preferredSeat?: Seat;
    role: "player" | "spectator";
    deck?: PlayerDeckWire;
    takeover: boolean;
    /** Verified uid of join.ownerToken, else null. */
    ownerUid: number | null;
  } {
    const join = parseJoinOptions(options);
    const role = join.role ?? "player";
    // Reject unknown cards here (onAuth) so only this client's join fails, with a
    // clear message, instead of createMatch throwing when the opponent joins.
    if (role === "player" && join.deck) assertKnownDeck(join.deck);
    const required = this.config.devJoinSecret;
    if (required && join.secret !== required) {
      throw new ProtocolError("unauthorized", "unauthorized");
    }
    // Practice seats are guest ids; a valid ownerToken names the account that may
    // take them over. An invalid one is ignored, never a reason to reject the join.
    const ownerUid = join.ownerToken ? (verifyGameToken(join.ownerToken)?.uid ?? null) : null;
    if (join.gameToken) {
      const payload = verifyGameToken(join.gameToken);
      if (!payload) {
        throw new ProtocolError("invalid game token", "unauthorized");
      }
      return {
        displayId: payload.email,
        // Never fall back to the email: it would leak to the opponent.
        displayName: payload.name ?? "Player",
        userId: payload.uid,
        preferredSeat: join.preferredSeat,
        role,
        deck: join.deck,
        takeover: join.takeover === true,
        ownerUid,
      };
    }
    if (this.config.requireGameToken) {
      throw new ProtocolError("gameToken required", "unauthorized");
    }
    const displayId = join.devUserId!;
    return {
      displayId,
      displayName: sanitizeDisplayName(displayId) ?? "Player",
      userId: hashToNegativeId(displayId),
      preferredSeat: join.preferredSeat,
      role,
      deck: join.deck,
      takeover: join.takeover === true,
      ownerUid,
    };
  }

  private clearSeat(sessionId: string) {
    // A seat gone for good ends an opening dice roll; the one left waits for an opponent again.
    this.dice.cancel();
    for (const seat of this.seats.release(sessionId)) {
      this.log("info", "player_left", {
        matchId: this.game.matchId,
        seat,
        sessionId,
      });
    }
    this.refreshMetadata();
    this.state.seatsFilled = this.seats.filled();
    presence.markDirty();
    this.intentLimiter.forget(sessionId);
    this.chat.forget(sessionId);
  }

  /** Enforce the identity/seat reservation created by ranked_queue. */
  private reservedSeatFor(identity: {
    userId: number;
    preferredSeat?: Seat;
    role: "player" | "spectator";
  }): Seat | null {
    const { seatUserIds } = this.config;
    if (identity.role === "spectator" || !seatUserIds) return null;
    const seat = seatUserIds.indexOf(identity.userId) as -1 | Seat;
    if (seat !== 0 && seat !== 1) {
      throw new ProtocolError("Identity is not reserved for this match", "unauthorized");
    }
    if (identity.preferredSeat !== seat) {
      throw new ProtocolError("Identity is not reserved for the requested seat", "unauthorized");
    }
    return seat;
  }

  /**
   * The seat `client` holds. A spectator or an unseated client cannot act: it is told why and
   * null comes back, so each handler starts with one early return.
   */
  private requireSeat(client: Client, spectatorMessage: string, unseatedMessage = "Not seated"): Seat | null {
    if (this.spectators.forClient(client)) {
      this.sendError(client, "unauthorized", spectatorMessage);
      return null;
    }
    const seat = this.seats.seatForClient(client);
    if (seat === null) this.sendError(client, "unauthorized", unseatedMessage);
    return seat;
  }

  startMatch(firstSeat: Seat, pickedBy: Seat | null) {
    const { game } = this;
    game.firstSeatPickedBy = pickedBy;
    this.resetPerGameState();
    const { players: createPlayers, autoSkipMulligan } = this.config;
    const deckA = game.seatDecks[0]?.deck ?? createPlayers?.[0]?.deck ?? buildTestDeck(20);
    const deckB = game.seatDecks[1]?.deck ?? createPlayers?.[1]?.deck ?? buildTestDeck(20);
    const leaderA =
      game.seatDecks[0]?.leaderId ?? createPlayers?.[0]?.leaderId ?? DEFAULT_LEADER_ID;
    const leaderB =
      game.seatDecks[1]?.leaderId ?? createPlayers?.[1]?.leaderId ?? DEFAULT_LEADER_ID;

    let match: MatchState;
    try {
      match = createMatch({
        seed: game.seed,
        firstSeat,
        players: [
          { leaderId: leaderA, deck: [...deckA] },
          { leaderId: leaderB, deck: [...deckB] },
        ],
      });
    } catch (e) {
      // Never leave both seats waiting on a match that cannot start.
      const message = `Could not start match: ${e instanceof Error ? e.message : String(e)}`;
      this.log("warn", "match_start_failed", { matchId: game.matchId, message });
      for (const slot of this.seats.all()) {
        if (!slot) continue;
        const client = this.io.clientFor(slot.sessionId);
        if (client) {
          this.sendError(client, "bad_protocol", message);
          client.leave();
        }
      }
      this.seats.clearHumans(game.bot ? BOT_SEAT : null);
      this.state.seatsFilled = game.bot ? 1 : 0;
      presence.markDirty();
      return;
    }

    if (autoSkipMulligan) {
      match = skipMulligans(match);
    }
    game.replay = {
      schema: MATCH_REPLAY_SCHEMA,
      rulesVersion: RULES_VERSION,
      registryHash: REGISTRY_HASH,
      seed: game.seed,
      firstSeat,
      skipMulligans: autoSkipMulligan,
      // createMatch's default: every non-Banish Life hit opens a private Life check (#352).
      lifeCheckEveryHit: true,
      privateChoicesV2: true,
      players: [
        { leaderId: leaderA, deck: [...deckA] },
        { leaderId: leaderB, deck: [...deckB] },
      ],
      intents: [],
    };

    game.match = match;
    game.matchStarted = true;
    this.refreshMetadata();
    this.recordStep(null, null, []);
    const [slot0, slot1] = [this.seats.slot(0)!, this.seats.slot(1)!];
    game.matchUserIds = [slot0.userId, slot1.userId];
    // Hotseat practice seats two guest accounts under one signed-in owner (#988).
    const [owner0, owner1] = this.seats.owners();
    game.practiceOwnerUid = owner0 != null && owner0 === owner1 ? owner0 : null;
    game.seatNames = [slot0.displayName, slot1.displayName];
    this.syncPublicState();
    this.log("info", "match_start", { matchId: game.matchId, seed: game.seed });
    this.cosmetics.startGame();

    for (const slot of this.seats.all()) {
      if (!slot) continue;
      const client = this.io.clientFor(slot.sessionId);
      if (!client) continue;
      this.sync.sendPlayerStart(client, slot.seat);
    }

    for (const spec of this.spectators.list) {
      const client = this.io.clientFor(spec.sessionId);
      if (!client) continue;
      this.sync.sendSpectatorSync(client, spec.cameraSeat);
    }

    this.clocks.startGame();
    this.maybeSendMatchOver();
    this.bots.scheduleStep();
  }

  private handleConcede(client: Client) {
    const { game } = this;
    if (this.spectators.forClient(client)) {
      this.sendError(client, "unauthorized", "Spectators cannot concede");
      return;
    }
    const seat = this.seats.seatForClient(client);
    if (seat === null || !game.match || game.matchOverSent) return;
    if (game.match.winner !== null || game.match.phase === "game_over") return;
    this.concedeSeat(seat);
  }

  concedeSeat(seat: Seat) {
    const { game } = this;
    if (!game.match) return;
    const winner = (seat === 0 ? 1 : 0) as Seat;
    game.endReason = "concede";
    game.match = {
      ...game.match,
      winner,
      winReason: "leader_battle_at_zero_life",
      phase: "game_over",
    };
    this.syncPublicState();
    this.spectators.broadcastViews([]);
    this.undo.request = null;
    this.undo.broadcastState();
    this.clocks.stopSeatClock();
    this.clocks.broadcastTimer();
    this.log("info", "concede", { matchId: game.matchId, seat, winner });
    this.maybeSendMatchOver();
  }

  private handleIntent(client: Client, message: unknown) {
    const { game } = this;
    const seat = this.requireSeat(client, "Spectators cannot send intents");
    if (seat === null) return;
    if (!game.match || !game.matchStarted) {
      this.sendError(client, "match_not_ready", "Match not started");
      return;
    }
    if (game.match.winner !== null || game.match.phase === "game_over") {
      this.sendError(client, "match_over", "Match is over");
      return;
    }
    if (!this.intentLimiter.consume(client.sessionId)) {
      this.sendError(client, "rate_limited", "Too many intents");
      return;
    }

    let intent: Intent;
    try {
      intent = parseIntentMessage(message);
    } catch (e) {
      this.io.sendParseError(client, e);
      return;
    }

    const applied = this.applySeatIntent(seat, intent);
    if (!applied.ok) {
      this.sendError(client, "illegal_intent", applied.message);
      this.io.send(client, "view", { view: this.spectators.playerView(game.match, seat) });
    }
  }

  /**
   * Apply an already-parsed intent for `seat` and do everything that follows a state change: replay
   * record, undo snapshot, views, timers, match over and the bot's next move. Shared by human
   * intents, the bot seat and the turn clock's automatic move, so all three take exactly the same path.
   */
  applySeatIntent(seat: Seat, intent: Intent): ApplyResult {
    const { game } = this;
    if (!game.match) return { ok: false, message: "Match not started" };
    const before = game.match;
    let undoSnap: UndoSnapshot | null;
    let result: ReturnType<typeof applyIntent>;
    try {
      undoSnap = this.undo.captureSnapshot(seat, intent);
      result = applyIntent(before, intent, { seat });
    } catch (e) {
      // applyIntent works on a clone, so game.match is untouched; answer like any illegal intent (refactor 0.2).
      this.log("warn", "apply_intent_threw", {
        matchId: game.matchId,
        seat,
        intentType: intent.type,
        error: e instanceof Error ? e.message : String(e),
      });
      return { ok: false, message: "Intent could not be applied" };
    }
    if (!result.ok) {
      this.log("info", "illegal_intent", {
        matchId: game.matchId,
        seat,
        code: result.error?.code,
        message: result.error?.message,
      });
      return { ok: false, message: result.error?.message ?? "Illegal intent" };
    }

    game.match = result.state;
    game.replay?.intents.push({ seat, intent });
    this.recordStep(undoSnap, before, result.events);
    this.syncPublicState();
    this.spectators.broadcastViews(result.events);
    this.clocks.onMatchAdvanced();
    this.maybeSendMatchOver();
    this.bots.scheduleStep();
    return { ok: true };
  }

  /** After a state change: save the turn's progress, then push the undo snapshot taken before the action. */
  private recordStep(...args: Parameters<UndoHistory["recordStep"]>) {
    this.persistence.noteTurn();
    this.undo.recordStep(...args);
  }

  /** Clear everything tied to one game so a rematch starts clean. */
  private resetPerGameState() {
    const { game } = this;
    this.bots.resetPerGameState();
    game.gameNumber += 1;
    game.matchOverSent = false;
    game.resultPending = null;
    game.endReason = null;
    game.replay = null;
    this.persistence.resetPerGameState();
    this.undo.resetPerGameState();
    this.clocks.resetPerGameState();
    this.rematch.resetPerGameState();
    this.spectators.resetPerGameState();
    this.cosmetics.resetPerGameState();
  }

  /** Tell everyone which seats dropped and until when they may reconnect. */
  private broadcastPresence() {
    this.io.broadcast("presence", { awayUntil: this.seats.awayUntil() });
  }

  maybeSendMatchOver() {
    const { game } = this;
    if (!game.match || game.match.winner === null || game.matchOverSent || game.resultPending) return;
    const result = {
      winner: game.match.winner,
      reason: game.endReason ?? game.match.winReason ?? "unknown",
    };
    this.bots.clearTimer();
    const autoDispose = this.autoDispose;
    this.autoDispose = false;
    game.resultPending = this.persistence.writebackResult(result.winner, result.reason).then(() => {
      game.matchOverSent = true;
      this.refreshMetadata();
      presence.markDirty();
      this.log("info", "match_end", { matchId: game.matchId, ...result });
      if (game.bot) {
        const turns = game.match?.turnNumber;
        this.log("info", "bot_game_over", { matchId: game.matchId, level: game.bot.level, winner: result.winner, turns, ...this.bots.stats });
      }
      this.io.broadcast("match_over", { result });
      this.rematch.broadcast();
      this.autoDispose = autoDispose;
      if (autoDispose && this.clients.length === 0) void this.disconnect().catch(() => undefined);
    });
  }

  /**
   * Test seams: the writeback methods below are what tests replace on a room instance to see (or
   * fail) what would be saved, so the collaborators always call them through the room.
   */
  ingestSeats(): [number, number] | { skip: string } {
    return this.persistence.ingestSeats();
  }

  persistSoloGame(payload: SoloGamePayload): Promise<void> {
    return postSoloGame(payload);
  }

  persistMatchProgress(matchId: string, payload: MatchProgressPayload): Promise<void> {
    return postMatchProgress(matchId, payload);
  }

  persistMatchResult(payload: MatchResultPayload): Promise<void> {
    return postMatchResult(payload);
  }

  /** Who is here, for the friends list ("in a game", spectate). */
  presenceEntries(): PresenceEntry[] {
    const { game } = this;
    const phase: PresenceEntry["phase"] = !game.matchStarted
      ? "waiting"
      : game.matchOverSent
        ? "finished"
        : "playing";
    const entries: PresenceEntry[] = [];
    for (const slot of this.seats.all()) {
      if (!slot || slot.userId === BOT_USER_ID) continue;
      entries.push({ user_id: slot.userId, room_id: this.roomId, role: "player", phase, ranked: game.ranked });
    }
    for (const spec of this.spectators.list) {
      entries.push({ user_id: spec.userId, room_id: this.roomId, role: "spectator", phase, ranked: game.ranked });
    }
    return entries;
  }

  syncPublicState() {
    if (!this.game.match) return;
    presence.markDirty();
    this.state.phase = this.game.match.phase;
    this.state.activeSeat = this.game.match.activeSeat;
    this.state.winner = this.game.match.winner === null ? -1 : this.game.match.winner;
  }

  /** The "sync" message, a join and a reconnect all land here (tests wrap it to see who was welcomed). */
  sendSync(client: Client) {
    this.sync.sendSync(client);
  }

  /** Turn a join away, with a log line so a stranded opponent can be traced. */
  private rejectJoin(client: Client, code: ErrorCode, message: string) {
    this.log("warn", "join_rejected", { matchId: this.game.matchId, sessionId: client.sessionId, code, message });
    this.sendError(client, code, message);
    client.leave();
  }

  private sendError(client: Client, code: ErrorCode, message: string) {
    this.io.send(client, "error", { code, message });
  }

  private log(level: LogLevel, event: string, data: Record<string, unknown>) {
    writeLog(level, event, data);
  }
}

/** Same check createMatch applies (unknown ids / non-Leader leaders), surfaced at join. */
export function hashToNegativeId(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
  const n = Math.abs(h) % 1_000_000_000;
  return -1 - n;
}
