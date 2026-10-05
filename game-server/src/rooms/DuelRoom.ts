import { Room, Client } from "colyseus";
import {
  applyIntent,
  buildTestDeck,
  createMatch,
  createSeededRng,
  DEFAULT_LEADER_ID,
  deserializeMatch,
  getPlayerView,
  getSpectatorView,
  projectGameEvents,
  listLegalIntents,
  MATCH_REPLAY_SCHEMA,
  REGISTRY_HASH,
  RULES_VERSION,
  seatLog,
  serializeMatch,
  skipMulligans,
  type GameEvent,
  type Intent,
  type MatchReplay,
  type MatchState,
  type Rng,
  type RngState,
  type Seat,
} from "@optcg/rules";
import {
  getDevJoinSecret,
  isRankedMatchCreateAttested,
  getLogLevel,
  getMatchOutboxDatabaseUrl,
  getRankedNoShowSeconds,
  getReconnectGraceSeconds,
  getSeatReservationSeconds,
  requireGameToken,
} from "../env.js";
import { sanitizeDisplayName, verifyGameToken } from "../gameToken.js";
import { checkMatchmakeToken, claimCreatorRoom, gameSeed, releaseCreatorRoom } from "../matchmakeGuard.js";
import { assertKnownDeck, rankedDeckProblem } from "../rankedDeck.js";
import {
  PROTOCOL_VERSION,
  parseChatMessage,
  parseCosmeticsMessage,
  parseSkinMessage,
  parseCreateOptions,
  parseIntentMessage,
  parseJoinOptions,
  parseRematchMessage,
  parseUndoMessage,
  type ArtPrefsMap,
  type ChatMessage,
  type CosmeticsMessage,
  type SeatSkin,
  type SkinMessage,
  type ErrorCode,
  type PlayerDeckWire,
  type SeatPlayerInfo,
  type RematchAction,
  type RematchStateMessage,
  type UndoAction,
  type UndoAppliedMessage,
  type UndoStateMessage,
  type WelcomeMessage,
} from "../protocol.js";
import {
  LatestOnlySender,
  postMatchProgress,
  postMatchResult,
  type MatchProgressPayload,
  type MatchResultPayload,
} from "../writeback.js";
import { presence, type PresenceEntry, type PresenceSource } from "../presence.js";
import { DuelPublicState } from "./schema/DuelPublicState.js";

type SeatSlot = {
  seat: Seat;
  sessionId: string;
  /** Stable player key for logs / legacy. */
  displayId: string;
  /** Public name shown to both seats (username, else account name). */
  displayName: string;
  /** FastAPI user id when known; synthetic negative for legacy devUserId. */
  userId: number;
};

type SpectatorSlot = {
  sessionId: string;
  displayId: string;
  userId: number;
  /** Which side is rendered as "you" in client layouts. */
  cameraSeat: Seat;
};

const INTENT_RATE_LIMIT = 20;
const INTENT_RATE_WINDOW_MS = 1000;
const MAX_SPECTATORS = 8;
const CHAT_RATE_LIMIT = 5;
const CHAT_RATE_WINDOW_MS = 5000;
const CHAT_HISTORY_LIMIT = 50;
/** Any message type, per client: more than this in one second drops the client (intents alone allow 20). */
const MAX_MESSAGES_PER_SECOND = 40;
/** Turn-start snapshots kept for undo (unranked rooms only). */
const UNDO_HISTORY_LIMIT = 20;

type TurnSnapshot = {
  /** serializeMatch() output — a deep copy the engine can never mutate. */
  match: string;
  rng: RngState;
  turnNumber: number;
  /** Replay intents up to this state, so an undo drops the rewound ones. */
  intentCount: number;
};

export class DuelRoom extends Room implements PresenceSource {
  maxClients = 2 + MAX_SPECTATORS;
  maxMessagesPerSecond = MAX_MESSAGES_PER_SECOND;
  state = new DuelPublicState();

  /** Matchmake-time token check (see checkMatchmakeToken); the instance onAuth then seats the client. */
  static async onAuth(_token: string, options: unknown): Promise<unknown> {
    return checkMatchmakeToken(options);
  }

  /** Account that created this room, counted against its open-room cap until dispose. */
  private creatorUid: number | null = null;

  private match: MatchState | null = null;
  private rng: Rng | null = null;
  private matchId = "";
  private seed = 0;
  /** This game's inputs, sent with the result for the backend to keep. Never sent to players. */
  private replay: MatchReplay | null = null;
  private autoSkipMulligan = true;
  private ranked = true;
  private createPlayers: [PlayerDeckWire, PlayerDeckWire] | undefined;
  private seatDecks: [PlayerDeckWire | null, PlayerDeckWire | null] = [null, null];
  private presetSeatUserIds: [number, number] | undefined;
  private seats: [SeatSlot | null, SeatSlot | null] = [null, null];
  private spectators: SpectatorSlot[] = [];
  /** Per-seat alt-art prefs (cosmetics only; not rules state). */
  private seatArtPrefs: [ArtPrefsMap, ArtPrefsMap] = [{}, {}];
  /** Per-seat custom playmat / card back (cosmetics only). */
  private seatSkins: [SeatSkin | null, SeatSkin | null] = [null, null];
  private intentTimestamps = new Map<string, number[]>();
  /** Recent chat lines, replayed on join / sync. Not persisted. */
  private chatLog: ChatMessage[] = [];
  private chatSeq = 0;
  private chatTimestamps = new Map<string, number[]>();
  private matchStarted = false;
  private matchOverSent = false;
  private resultPending: Promise<void> | null = null;
  private matchUserIds: [number, number] | null = null;
  /** Names captured at match start so they survive a seat dropping. */
  private seatNames: [string | null, string | null] = [null, null];
  private endReason: string | null = null;
  private turnSeconds: number | null = null;
  private matchSeconds: number | null = null;
  private turnEndsAt: number | null = null;
  private matchEndsAt: number | null = null;
  /** Chess clock: per-seat time banks (ms), charged to whoever must act. */
  private seatSeconds: number | null = null;
  private seatRemainingMs: [number, number] = [0, 0];
  private clockSeat: Seat | null = null;
  private clockSince = 0;
  /** Seats that dropped and may still reconnect, with their grace deadline. */
  private awayUntil: [number | null, number | null] = [null, null];
  /** Games played in this room (rematches); keys each result write-back. */
  private gameNumber = 0;
  private rematchRequested: [boolean, boolean] = [false, false];
  private rematchDeclinedBy: Seat | null = null;
  private timerInterval: ReturnType<typeof setInterval> | null = null;
  private lastTimerActiveSeat: Seat | null = null;
  /** Start-of-turn states, oldest first (unranked rooms only). */
  private turnSnapshots: TurnSnapshot[] = [];
  /** True once anything happened after the newest snapshot. */
  private actedSinceSnapshot = false;
  private undoRequest: { from: Seat; toTurn: number } | null = null;
  private lastUndoStateKey = "";
  /** Turn of the last progress snapshot, so the log is saved once per turn. */
  private progressTurn: number | null = null;
  private progress = new LatestOnlySender<{ matchId: string; payload: MatchProgressPayload }>(
    ({ matchId, payload }) => this.persistMatchProgress(matchId, payload),
    () => this.log("warn", "match_progress_failed", { matchId: this.matchId }),
  );

  onCreate(options: unknown) {
    // Free-tier cold starts need >15s between matchmake HTTP and WS consume.
    this.seatReservationTimeout = getSeatReservationSeconds();

    const parsed = parseCreateOptions(options);
    this.creatorUid = claimCreatorRoom(options);
    // Rooms are joined by id only (create, invites, the ranked matchmaker), so a
    // stranger's id-less matchmake join can never land in, or fill, someone's room.
    void this.setPrivate(true);
    this.seed = parsed.seed;
    this.autoSkipMulligan = parsed.autoSkipMulligan;
    this.createPlayers = parsed.players;
    if (parsed.players) {
      for (const deck of parsed.players) assertKnownDeck(deck);
    }
    if (parsed.ranked && parsed.players) {
      for (const deck of parsed.players) {
        const problem = rankedDeckProblem(deck);
        if (problem) throw new Error(problem);
      }
    }
    if (parsed.players) {
      this.seatDecks = [parsed.players[0], parsed.players[1]];
    }
    // Never trust a browser-provided `ranked: true`. Only the in-process
    // matchmaker can supply the server-only capability needed for Elo matches.
    const attestation =
      options && typeof options === "object"
        ? (options as { rankedAttestation?: unknown }).rankedAttestation
        : undefined;
    this.ranked = parsed.ranked && isRankedMatchCreateAttested(attestation);
    this.turnSeconds = parsed.timer.turnSeconds;
    this.matchSeconds = parsed.timer.matchSeconds;
    this.seatSeconds = parsed.timer.seatSeconds;
    this.presetSeatUserIds = parsed.seatUserIds;
    if (this.presetSeatUserIds) {
      // A paired ranked room: if one player never makes it in (deck turned
      // away, closed the tab), don't leave the other on "Waiting" forever.
      this.clock.setTimeout(() => this.expireNoShow(), getRankedNoShowSeconds() * 1000);
    }
    this.matchId = this.roomId;
    this.state.matchId = this.matchId;
    this.state.seatsFilled = 0;
    this.state.phase = "waiting";
    this.state.activeSeat = 0;
    this.state.winner = -1;
    this.state.protocolVersion = PROTOCOL_VERSION;

    this.onMessage("intent", (client, message) => {
      this.handleIntent(client, message);
    });

    this.onMessage("concede", (client) => {
      this.handleConcede(client);
    });

    this.onMessage("sync", (client) => {
      this.sendSync(client);
    });

    this.onMessage("ping", (client, message) => {
      const t =
        message && typeof message === "object"
          ? (message as { t?: number }).t
          : undefined;
      client.send("pong", { t });
    });

    this.onMessage("skin", (client, message) => {
      this.handleSkin(client, message);
    });
    this.onMessage("cosmetics", (client, message) => {
      this.handleCosmetics(client, message);
    });

    this.onMessage("chat", (client, message) => {
      this.handleChat(client, message);
    });

    this.onMessage("undo", (client, message) => {
      this.handleUndo(client, message);
    });

    this.onMessage("rematch", (client, message) => {
      this.handleRematch(client, message);
    });

    presence.register(this);
    this.log("info", "room_created", {
      matchId: this.matchId,
      seed: this.seed,
      ranked: this.ranked,
      turnSeconds: this.turnSeconds,
      matchSeconds: this.matchSeconds,
      seatSeconds: this.seatSeconds,
    });
  }

  async onDispose() {
    releaseCreatorRoom(this.creatorUid);
    this.creatorUid = null;
    presence.unregister(this);
    this.clearTimerLoop();
    this.log("info", "room_disposed", { matchId: this.matchId });
    // A game closing without a result keeps its log up to the last action.
    if (this.matchStarted && !this.matchOverSent && !this.resultPending) {
      await this.saveProgress();
    }
  }

  async onBeforeShutdown() {
    // Do not dispose a completed match before its result is durably queued.
    await this.resultPending;
    super.onBeforeShutdown();
  }

  onAuth(client: Client, options: unknown) {
    try {
      return this.resolveIdentity(options);
    } catch (e) {
      const err = e as Error & { code?: ErrorCode };
      this.log("warn", "join_rejected", {
        matchId: this.matchId,
        sessionId: client.sessionId,
        code: err.code ?? "bad_protocol",
        message: err.message,
      });
      throw e;
    }
  }

  /** Ranked: the paired opponent never claimed their seat, so close the room. */
  private expireNoShow() {
    if (this.matchStarted) return;
    this.log("warn", "opponent_no_show", {
      matchId: this.matchId,
      seats: [this.seats[0]?.userId ?? null, this.seats[1]?.userId ?? null],
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
    let identity: {
      displayId: string;
      displayName: string;
      userId: number;
      preferredSeat?: Seat;
      role: "player" | "spectator";
      deck?: PlayerDeckWire;
    };
    try {
      identity = this.resolveIdentity(options);
    } catch (e) {
      const err = e as Error & { code?: ErrorCode };
      this.rejectJoin(client, err.code ?? "bad_protocol", err.message);
      return;
    }

    let reservedSeat: Seat | null = null;
    try {
      reservedSeat = this.reservedSeatFor(identity);
    } catch (e) {
      const err = e as Error & { code?: ErrorCode };
      this.rejectJoin(client, err.code ?? "unauthorized", err.message);
      return;
    }

    // Reclaim after allowReconnection: same sessionId may already be seated.
    const existingSeat = this.seatForClient(client);
    if (existingSeat !== null) {
      const slot = this.seats[existingSeat];
      if (
        !slot ||
        slot.userId !== identity.userId ||
        (reservedSeat !== null && reservedSeat !== existingSeat)
      ) {
        this.rejectJoin(client, "unauthorized", "Identity does not own this seat");
        return;
      }
      this.log("info", "player_reconnected", {
        matchId: this.matchId,
        seat: existingSeat,
        sessionId: client.sessionId,
      });
      this.sendSync(client);
      return;
    }

    if (identity.role === "spectator") {
      if (this.spectators.length >= MAX_SPECTATORS) {
        this.rejectJoin(client, "room_full", "Spectator cap reached");
        return;
      }
      const cameraSeat: Seat =
        identity.preferredSeat === 0 || identity.preferredSeat === 1
          ? identity.preferredSeat
          : 0;
      this.spectators.push({
        sessionId: client.sessionId,
        displayId: identity.displayId,
        userId: identity.userId,
        cameraSeat,
      });
      presence.markDirty();
      this.log("info", "spectator_joined", {
        matchId: this.matchId,
        displayId: identity.displayId,
        cameraSeat,
        sessionId: client.sessionId,
        spectatorCount: this.spectators.length,
      });
      if (this.matchStarted && this.match) {
        this.sendSpectatorSync(client, cameraSeat);
      } else {
        this.sendError(client, "match_not_ready", "Waiting for duel to start");
      }
      return;
    }

    // Once a match has started its seats are fixed: a vacated seat can only be
    // reclaimed through allowReconnection (handled above), never by a new join.
    // Otherwise anyone with the room id could take over after a Leave, read
    // the leaver's hand and cancel the forfeit.
    if (this.matchStarted) {
      this.rejectJoin(client, "room_full", "Match already in progress");
      return;
    }

    if (this.ranked && identity.deck) {
      const problem = rankedDeckProblem(identity.deck);
      if (problem) {
        this.rejectJoin(client, "unsupported_deck", problem);
        return;
      }
    }

    if (reservedSeat !== null && this.seats[reservedSeat]) {
      this.rejectJoin(client, "room_full", "Reserved seat is already occupied");
      return;
    }
    const seat =
      reservedSeat ??
      this.assignSeat(
        client.sessionId,
        identity.displayId,
        identity.displayName,
        identity.userId,
        identity.preferredSeat,
      );
    if (reservedSeat !== null) {
      this.seats[reservedSeat] = {
        seat: reservedSeat,
        sessionId: client.sessionId,
        displayId: identity.displayId,
        displayName: identity.displayName,
        userId: identity.userId,
      };
    }
    if (seat === null) {
      this.rejectJoin(client, "room_full", "No free seat");
      return;
    }

    if (identity.deck) {
      this.seatDecks[seat] = identity.deck;
    }

    this.state.seatsFilled = (this.seats[0] ? 1 : 0) + (this.seats[1] ? 1 : 0);
    presence.markDirty();
    this.log("info", "player_joined", {
      matchId: this.matchId,
      seat,
      displayId: identity.displayId,
      userId: identity.userId,
      sessionId: client.sessionId,
      hasDeck: Boolean(identity.deck),
    });

    if (this.seats[0] && this.seats[1] && !this.matchStarted) {
      this.startMatch();
    } else if (this.matchStarted && this.match) {
      this.sendSync(client);
    }
  }

  /** Consented leave (CloseCode.CONSENTED) — no reclaim. */
  onLeave(client: Client, _code?: number) {
    if (this.spectatorForClient(client)) {
      this.clearSpectator(client.sessionId);
      return;
    }
    const seat = this.seatForClient(client);
    if (seat === null) return;
    this.clearSeat(client.sessionId);
    this.broadcastRematchState();
    // Leaving a live match forfeits it, so the other player isn't stranded.
    // The short delay lets a practice match (both seats leaving together)
    // simply dispose instead of recording a result.
    this.clock.setTimeout(() => this.forfeitAbsentSeat(seat, "abandoned"), 1500);
  }

  /** End a live match for a seat that is gone for good (left / reclaim timed out). */
  private forfeitAbsentSeat(seat: Seat, reason: "abandoned" | "disconnect") {
    if (!this.match || !this.matchStarted || this.matchOverSent) return;
    if (this.match.winner !== null || this.match.phase === "game_over") return;
    if (this.seats[seat]) return; // came back
    const other = (seat === 0 ? 1 : 0) as Seat;
    if (!this.seats[other]) return; // nobody left to hand the win to
    this.endReason = reason;
    this.match = { ...this.match, winner: other, winReason: "leader_battle_at_zero_life", phase: "game_over" };
    this.awayUntil = [null, null];
    this.undoRequest = null;
    this.syncPublicState();
    this.stopSeatClock();
    this.clearTimerLoop();
    this.broadcastTimer();
    this.broadcastUndoState();
    this.broadcastPresence();
    this.log("info", "forfeit_absent", { matchId: this.matchId, seat, reason, winner: other });
    this.maybeSendMatchOver();
  }

  /**
   * Unexpected disconnect — offer seat reclaim for RECONNECT_GRACE_SECONDS.
   * Colyseus 0.18 routes drops here when `onDrop` is defined.
   */
  async onDrop(client: Client, _code?: number) {
    if (this.spectatorForClient(client)) {
      this.clearSpectator(client.sessionId);
      return;
    }
    const seat = this.seatForClient(client);
    if (seat === null) return;

    // Still allow reclaim before the match starts (hotseat StrictMode / refresh
    // during the seat-1 join window). Only skip once the match is over.
    if (this.matchOverSent) {
      this.clearSeat(client.sessionId);
      return;
    }

    const grace = getReconnectGraceSeconds();
    this.log("info", "player_disconnected", {
      matchId: this.matchId,
      seat,
      graceSeconds: grace,
    });
    this.awayUntil[seat] = Date.now() + grace * 1000;
    this.broadcastPresence();
    try {
      await this.allowReconnection(client, grace);
      this.log("info", "player_reclaim_ok", {
        matchId: this.matchId,
        seat,
        sessionId: client.sessionId,
      });
      this.awayUntil[seat] = null;
      this.broadcastPresence();
      this.sendSync(client);
    } catch {
      this.log("info", "player_reclaim_timeout", {
        matchId: this.matchId,
        seat,
      });
      this.awayUntil[seat] = null;
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
  } {
    const join = parseJoinOptions(options);
    const role = join.role ?? "player";
    // Reject unknown cards here (onAuth) so only this client's join fails, with a
    // clear message, instead of createMatch throwing when the opponent joins.
    if (role === "player" && join.deck) assertKnownDeck(join.deck);
    const required = getDevJoinSecret();
    if (required && join.secret !== required) {
      throw Object.assign(new Error("unauthorized"), { code: "unauthorized" as const });
    }
    if (join.gameToken) {
      const payload = verifyGameToken(join.gameToken);
      if (!payload) {
        throw Object.assign(new Error("invalid game token"), {
          code: "unauthorized" as const,
        });
      }
      return {
        displayId: payload.email,
        // Never fall back to the email: it would leak to the opponent.
        displayName: payload.name ?? "Player",
        userId: payload.uid,
        preferredSeat: join.preferredSeat,
        role,
        deck: join.deck,
      };
    }
    if (requireGameToken()) {
      throw Object.assign(new Error("gameToken required"), {
        code: "unauthorized" as const,
      });
    }
    const displayId = join.devUserId!;
    return {
      displayId,
      displayName: sanitizeDisplayName(displayId) ?? "Player",
      userId: hashToNegativeId(displayId),
      preferredSeat: join.preferredSeat,
      role,
      deck: join.deck,
    };
  }

  private clearSeat(sessionId: string) {
    for (let i = 0; i < 2; i++) {
      const slot = this.seats[i];
      if (slot && slot.sessionId === sessionId) {
        this.log("info", "player_left", {
          matchId: this.matchId,
          seat: i,
          sessionId,
        });
        this.seats[i] = null;
      }
    }
    this.state.seatsFilled = (this.seats[0] ? 1 : 0) + (this.seats[1] ? 1 : 0);
    presence.markDirty();
    this.intentTimestamps.delete(sessionId);
    this.chatTimestamps.delete(sessionId);
  }

  private clearSpectator(sessionId: string) {
    const before = this.spectators.length;
    this.spectators = this.spectators.filter((s) => s.sessionId !== sessionId);
    if (this.spectators.length !== before) {
      presence.markDirty();
      this.log("info", "spectator_left", {
        matchId: this.matchId,
        sessionId,
        spectatorCount: this.spectators.length,
      });
    }
  }

  private spectatorForClient(client: Client): SpectatorSlot | null {
    return this.spectators.find((s) => s.sessionId === client.sessionId) ?? null;
  }

  private assignSeat(
    sessionId: string,
    displayId: string,
    displayName: string,
    userId: number,
    preferred?: Seat,
  ): Seat | null {
    if (preferred === 0 || preferred === 1) {
      if (!this.seats[preferred]) {
        this.seats[preferred] = { seat: preferred, sessionId, displayId, displayName, userId };
        return preferred;
      }
    }
    for (const seat of [0, 1] as Seat[]) {
      if (!this.seats[seat]) {
        this.seats[seat] = { seat, sessionId, displayId, displayName, userId };
        return seat;
      }
    }
    return null;
  }

  /** Enforce the identity/seat reservation created by ranked_queue. */
  private reservedSeatFor(identity: {
    userId: number;
    preferredSeat?: Seat;
    role: "player" | "spectator";
  }): Seat | null {
    if (identity.role === "spectator" || !this.presetSeatUserIds) return null;
    const seat = this.presetSeatUserIds.indexOf(identity.userId) as -1 | Seat;
    if (seat !== 0 && seat !== 1) {
      throw Object.assign(new Error("Identity is not reserved for this match"), {
        code: "unauthorized" as const,
      });
    }
    if (identity.preferredSeat !== seat) {
      throw Object.assign(new Error("Identity is not reserved for the requested seat"), {
        code: "unauthorized" as const,
      });
    }
    return seat;
  }

  private seatForClient(client: Client): Seat | null {
    for (const slot of this.seats) {
      if (slot && slot.sessionId === client.sessionId) return slot.seat;
    }
    return null;
  }

  private startMatch(firstSeat: Seat = 0) {
    this.resetPerGameState();
    this.rng = createSeededRng(this.seed);
    const deckA = this.seatDecks[0]?.deck ?? this.createPlayers?.[0]?.deck ?? buildTestDeck(20);
    const deckB = this.seatDecks[1]?.deck ?? this.createPlayers?.[1]?.deck ?? buildTestDeck(20);
    const leaderA =
      this.seatDecks[0]?.leaderId ?? this.createPlayers?.[0]?.leaderId ?? DEFAULT_LEADER_ID;
    const leaderB =
      this.seatDecks[1]?.leaderId ?? this.createPlayers?.[1]?.leaderId ?? DEFAULT_LEADER_ID;

    let match: MatchState;
    try {
      match = createMatch({
        seed: this.seed,
        firstSeat,
        players: [
          { leaderId: leaderA, deck: [...deckA] },
          { leaderId: leaderB, deck: [...deckB] },
        ],
      });
    } catch (e) {
      // Never leave both seats waiting on a match that cannot start.
      const message = `Could not start match: ${e instanceof Error ? e.message : String(e)}`;
      this.log("warn", "match_start_failed", { matchId: this.matchId, message });
      for (const slot of this.seats) {
        if (!slot) continue;
        const client = this.clients.find((c) => c.sessionId === slot.sessionId);
        if (client) {
          this.sendError(client, "bad_protocol", message);
          client.leave();
        }
      }
      this.seats = [null, null];
      this.state.seatsFilled = 0;
      presence.markDirty();
      return;
    }

    if (this.autoSkipMulligan) {
      match = skipMulligans(match, this.rng);
    }
    this.replay = {
      schema: MATCH_REPLAY_SCHEMA,
      rulesVersion: RULES_VERSION,
      registryHash: REGISTRY_HASH,
      seed: this.seed,
      firstSeat,
      skipMulligans: this.autoSkipMulligan,
      players: [
        { leaderId: leaderA, deck: [...deckA] },
        { leaderId: leaderB, deck: [...deckB] },
      ],
      intents: [],
    };

    this.match = match;
    this.matchStarted = true;
    this.recordTurnSnapshot();
    this.matchUserIds = [this.seats[0]!.userId, this.seats[1]!.userId];
    this.seatNames = [this.seats[0]!.displayName, this.seats[1]!.displayName];
    this.syncPublicState();
    this.log("info", "match_start", { matchId: this.matchId, seed: this.seed });

    for (const slot of this.seats) {
      if (!slot) continue;
      const client = this.clients.find((c) => c.sessionId === slot.sessionId);
      if (!client) continue;
      const view = getPlayerView(match, slot.seat);
      const welcome: WelcomeMessage = {
        protocolVersion: PROTOCOL_VERSION,
        matchId: this.matchId,
        seat: slot.seat,
        role: "player",
        view,
        players: this.playersInfo(),
      };
      client.send("welcome", welcome);
      client.send("view", {
        protocolVersion: PROTOCOL_VERSION,
        view,
      });
      this.sendStoredCosmetics(client);
      this.sendChatHistory(client);
      this.sendUndoState(client);
    }

    for (const spec of this.spectators) {
      const client = this.clients.find((c) => c.sessionId === spec.sessionId);
      if (!client) continue;
      this.sendSpectatorSync(client, spec.cameraSeat);
    }

    this.armMatchClock();
    this.armSeatClocks();
    this.refreshTurnClock();
    this.updateSeatClock();
    this.ensureTimerLoop();
    this.broadcastTimer();
    this.maybeSendMatchOver();
  }

  private handleCosmetics(client: Client, message: unknown) {
    if (this.spectatorForClient(client)) {
      this.sendError(client, "unauthorized", "Spectators cannot set cosmetics");
      return;
    }
    const seat = this.seatForClient(client);
    if (seat === null) {
      this.sendError(client, "unauthorized", "Not seated");
      return;
    }
    let artPrefs: ArtPrefsMap;
    try {
      artPrefs = parseCosmeticsMessage(message);
    } catch (e) {
      const err = e as Error & { code?: ErrorCode };
      this.sendError(client, err.code ?? "bad_protocol", err.message);
      return;
    }
    this.seatArtPrefs[seat] = artPrefs;
    const payload: CosmeticsMessage = {
      protocolVersion: PROTOCOL_VERSION,
      seat,
      artPrefs,
    };
    // Relay to everyone (including sender) so reconnecting clients stay aligned.
    this.broadcast("cosmetics", payload);
  }

  private handleSkin(client: Client, message: unknown) {
    if (this.spectatorForClient(client)) {
      this.sendError(client, "unauthorized", "Spectators cannot set cosmetics");
      return;
    }
    const seat = this.seatForClient(client);
    if (seat === null) {
      this.sendError(client, "unauthorized", "No seat for cosmetics");
      return;
    }
    let skin: SeatSkin;
    try {
      skin = parseSkinMessage(message);
    } catch (e) {
      const err = e as Error & { code?: ErrorCode };
      this.sendError(client, err.code ?? "bad_protocol", err.message);
      return;
    }
    this.seatSkins[seat] = skin;
    const payload: SkinMessage = { protocolVersion: PROTOCOL_VERSION, seat, skin };
    this.broadcast("skin", payload);
  }

  private handleChat(client: Client, message: unknown) {
    if (this.spectatorForClient(client)) {
      this.sendError(client, "unauthorized", "Spectators cannot chat");
      return;
    }
    const seat = this.seatForClient(client);
    if (seat === null) {
      this.sendError(client, "unauthorized", "Not seated");
      return;
    }
    let text: string;
    try {
      text = parseChatMessage(message);
    } catch (e) {
      const err = e as Error & { code?: ErrorCode };
      this.sendError(client, err.code ?? "bad_protocol", err.message);
      return;
    }
    if (!this.consumeChatRateLimit(client.sessionId)) {
      this.sendError(client, "rate_limited", "Slow down — too many chat messages");
      return;
    }
    this.chatSeq += 1;
    const line: ChatMessage = {
      protocolVersion: PROTOCOL_VERSION,
      id: `${this.matchId}-${this.chatSeq}`,
      seat,
      text,
      at: Date.now(),
    };
    this.chatLog.push(line);
    if (this.chatLog.length > CHAT_HISTORY_LIMIT) this.chatLog.shift();
    // Relay to everyone (including sender and spectators).
    this.broadcast("chat", line);
  }

  private sendChatHistory(client: Client) {
    if (this.chatLog.length === 0) return;
    client.send("chat_history", {
      protocolVersion: PROTOCOL_VERSION,
      messages: this.chatLog,
    });
  }

  private consumeChatRateLimit(sessionId: string): boolean {
    const now = Date.now();
    const recent = (this.chatTimestamps.get(sessionId) ?? []).filter(
      (t) => t >= now - CHAT_RATE_WINDOW_MS,
    );
    if (recent.length >= CHAT_RATE_LIMIT) {
      this.chatTimestamps.set(sessionId, recent);
      return false;
    }
    recent.push(now);
    this.chatTimestamps.set(sessionId, recent);
    return true;
  }

  /** Push stored seat cosmetics to one client (join / sync). */
  private sendStoredCosmetics(client: Client) {
    for (const seat of [0, 1] as Seat[]) {
      const artPrefs = this.seatArtPrefs[seat];
      if (!artPrefs || Object.keys(artPrefs).length === 0) continue;
      const payload: CosmeticsMessage = {
        protocolVersion: PROTOCOL_VERSION,
        seat,
        artPrefs,
      };
      client.send("cosmetics", payload);
    }
    for (const seat of [0, 1] as Seat[]) {
      const skin = this.seatSkins[seat];
      if (!skin) continue;
      const payload: SkinMessage = { protocolVersion: PROTOCOL_VERSION, seat, skin };
      client.send("skin", payload);
    }
  }

  private handleConcede(client: Client) {
    if (this.spectatorForClient(client)) {
      this.sendError(client, "unauthorized", "Spectators cannot concede");
      return;
    }
    const seat = this.seatForClient(client);
    if (seat === null || !this.match || this.matchOverSent) return;
    if (this.match.winner !== null || this.match.phase === "game_over") return;
    const winner = (seat === 0 ? 1 : 0) as Seat;
    this.endReason = "concede";
    this.match = {
      ...this.match,
      winner,
      winReason: "leader_battle_at_zero_life",
      phase: "game_over",
    };
    this.syncPublicState();
    this.undoRequest = null;
    this.broadcastUndoState();
    this.stopSeatClock();
    this.broadcastTimer();
    this.log("info", "concede", { matchId: this.matchId, seat, winner });
    this.maybeSendMatchOver();
  }

  private handleIntent(client: Client, message: unknown) {
    if (this.spectatorForClient(client)) {
      this.sendError(client, "unauthorized", "Spectators cannot send intents");
      return;
    }
    const seat = this.seatForClient(client);
    if (seat === null) {
      this.sendError(client, "unauthorized", "Not seated");
      return;
    }
    if (!this.match || !this.rng || !this.matchStarted) {
      this.sendError(client, "match_not_ready", "Match not started");
      return;
    }
    if (this.match.winner !== null || this.match.phase === "game_over") {
      this.sendError(client, "match_over", "Match is over");
      return;
    }
    if (!this.consumeRateLimit(client.sessionId)) {
      this.sendError(client, "rate_limited", "Too many intents");
      return;
    }

    let intent: Intent;
    try {
      intent = parseIntentMessage(message);
    } catch (e) {
      const err = e as Error & { code?: ErrorCode };
      this.sendError(client, err.code ?? "bad_protocol", err.message);
      return;
    }

    const before = this.match;
    const result = applyIntent(before, intent, { seat, rng: this.rng });
    if (!result.ok) {
      this.log("info", "illegal_intent", {
        matchId: this.matchId,
        seat,
        code: result.error?.code,
        message: result.error?.message,
      });
      this.sendError(
        client,
        "illegal_intent",
        result.error?.message ?? "Illegal intent",
      );
      client.send("view", {
        protocolVersion: PROTOCOL_VERSION,
        view: getPlayerView(before, seat),
      });
      return;
    }

    this.match = result.state;
    this.replay?.intents.push({ seat, intent });
    this.recordTurnSnapshot();
    this.syncPublicState();
    this.broadcastViews(result.events);
    this.onMatchAdvanced();
    this.maybeSendMatchOver();
  }

  /** Clear everything tied to one game so a rematch starts clean. */
  private resetPerGameState() {
    this.gameNumber += 1;
    this.matchOverSent = false;
    this.resultPending = null;
    this.endReason = null;
    this.replay = null;
    this.progressTurn = null;
    this.turnSnapshots = [];
    this.actedSinceSnapshot = false;
    this.undoRequest = null;
    this.lastUndoStateKey = "";
    this.turnEndsAt = null;
    this.matchEndsAt = null;
    this.lastTimerActiveSeat = null;
    this.clockSeat = null;
    this.rematchRequested = [false, false];
    this.rematchDeclinedBy = null;
  }

  private rematchState(): RematchStateMessage {
    const available =
      !this.ranked &&
      this.matchOverSent &&
      this.match?.winner != null &&
      this.seats[0] != null &&
      this.seats[1] != null;
    const both = this.rematchRequested[0] && this.rematchRequested[1];
    return {
      protocolVersion: PROTOCOL_VERSION,
      available,
      requested: [...this.rematchRequested],
      declinedBy: this.rematchDeclinedBy,
      chooser: available && both && this.match?.winner != null ? ((1 - this.match.winner) as Seat) : null,
    };
  }

  private broadcastRematchState() {
    // Ranked rooms never offer a rematch, so clients never show the option.
    if (!this.matchOverSent || this.ranked) return;
    this.broadcast("rematch_state", this.rematchState());
  }

  private handleRematch(client: Client, message: unknown) {
    if (this.spectatorForClient(client)) {
      this.sendError(client, "unauthorized", "Spectators cannot request a rematch");
      return;
    }
    const seat = this.seatForClient(client);
    if (seat === null) {
      this.sendError(client, "unauthorized", "Not seated");
      return;
    }
    let action: RematchAction;
    try {
      action = parseRematchMessage(message);
    } catch (e) {
      const err = e as Error & { code?: ErrorCode };
      this.sendError(client, err.code ?? "bad_protocol", err.message);
      return;
    }
    const state = this.rematchState();
    if (!state.available) {
      this.sendError(
        client,
        this.ranked ? "unauthorized" : "match_not_ready",
        this.ranked ? "Rematch is only available in private matches" : "Rematch isn't available right now",
      );
      return;
    }
    switch (action) {
      case "request":
        this.rematchRequested[seat] = true;
        this.rematchDeclinedBy = null;
        this.broadcastRematchState();
        return;
      case "decline":
        this.rematchRequested = [false, false];
        this.rematchDeclinedBy = seat;
        this.broadcastRematchState();
        return;
      case "first":
      case "second": {
        if (state.chooser !== seat) {
          this.sendError(client, "unauthorized", "The player who lost chooses the turn order");
          return;
        }
        const firstSeat: Seat = action === "first" ? seat : ((1 - seat) as Seat);
        this.seed = gameSeed();
        this.log("info", "rematch_start", { matchId: this.matchId, game: this.gameNumber + 1, firstSeat });
        this.startMatch(firstSeat);
        return;
      }
    }
  }

  /**
   * Track start-of-turn states for undo. Call after every state change: a new
   * turn number (outside mulligan) records a snapshot, anything else marks the
   * current turn as having actions to undo. A state change also voids any
   * open undo request, since it named a turn relative to the old state.
   */
  private recordTurnSnapshot() {
    if (this.match && this.match.winner === null && this.match.turnNumber !== this.progressTurn) {
      this.progressTurn = this.match.turnNumber;
      void this.saveProgress();
    }
    if (this.ranked || !this.match || !this.rng) return;
    const m = this.match;
    const top = this.turnSnapshots.at(-1);
    if (m.phase !== "mulligan" && m.winner === null && top?.turnNumber !== m.turnNumber) {
      this.turnSnapshots.push({
        match: serializeMatch(m),
        rng: this.rng.snapshot(),
        turnNumber: m.turnNumber,
        intentCount: this.replay?.intents.length ?? 0,
      });
      if (this.turnSnapshots.length > UNDO_HISTORY_LIMIT) this.turnSnapshots.shift();
      this.actedSinceSnapshot = false;
    } else if (top) {
      this.actedSinceSnapshot = true;
    }
    this.undoRequest = null;
    this.broadcastUndoState();
  }

  /**
   * Snapshot an undo would restore: the current turn's start once something
   * happened this turn, otherwise the previous turn's start.
   */
  private undoTargetIndex(): number | null {
    const n = this.turnSnapshots.length;
    if (n === 0) return null;
    if (this.actedSinceSnapshot) return n - 1;
    return n >= 2 ? n - 2 : null;
  }

  private undoState(): UndoStateMessage {
    const enabled = !this.ranked;
    const over = !this.match || this.match.winner !== null || this.matchOverSent;
    const idx = enabled && !over ? this.undoTargetIndex() : null;
    return {
      protocolVersion: PROTOCOL_VERSION,
      enabled,
      targetTurn: idx === null ? null : this.turnSnapshots[idx]!.turnNumber,
      pending: over ? null : this.undoRequest,
    };
  }

  private sendUndoState(client: Client) {
    client.send("undo_state", this.undoState());
  }

  private broadcastUndoState() {
    const state = this.undoState();
    const key = JSON.stringify(state);
    if (key === this.lastUndoStateKey) return;
    this.lastUndoStateKey = key;
    this.broadcast("undo_state", state);
  }

  private handleUndo(client: Client, message: unknown) {
    if (this.spectatorForClient(client)) {
      this.sendError(client, "unauthorized", "Spectators cannot undo");
      return;
    }
    const seat = this.seatForClient(client);
    if (seat === null) {
      this.sendError(client, "unauthorized", "Not seated");
      return;
    }
    let action: UndoAction;
    try {
      action = parseUndoMessage(message);
    } catch (e) {
      const err = e as Error & { code?: ErrorCode };
      this.sendError(client, err.code ?? "bad_protocol", err.message);
      return;
    }
    if (this.ranked) {
      this.sendError(client, "unauthorized", "Undo is only available in private matches");
      return;
    }
    if (!this.match || !this.matchStarted) {
      this.sendError(client, "match_not_ready", "Match not started");
      return;
    }
    if (this.match.winner !== null || this.matchOverSent) {
      this.sendError(client, "match_over", "Match is over");
      return;
    }

    const req = this.undoRequest;
    switch (action) {
      case "request": {
        const idx = this.undoTargetIndex();
        if (idx === null) {
          this.sendError(client, "illegal_intent", "Nothing to undo yet");
          return;
        }
        this.undoRequest = { from: seat, toTurn: this.turnSnapshots[idx]!.turnNumber };
        this.log("info", "undo_requested", {
          matchId: this.matchId,
          seat,
          toTurn: this.undoRequest.toTurn,
        });
        this.broadcastUndoState();
        return;
      }
      case "cancel":
      case "decline": {
        // The requester cancels; the other seat declines.
        if (!req) return;
        if ((action === "cancel") !== (req.from === seat)) {
          this.sendError(client, "unauthorized", "Not your undo request to answer");
          return;
        }
        this.undoRequest = null;
        this.broadcastUndoState();
        return;
      }
      case "accept": {
        if (!req) {
          this.sendError(client, "illegal_intent", "No undo request to accept");
          return;
        }
        if (req.from === seat) {
          this.sendError(client, "unauthorized", "The other player must accept the undo");
          return;
        }
        this.applyUndo(req.from);
        return;
      }
    }
  }

  private applyUndo(by: Seat) {
    const idx = this.undoTargetIndex();
    if (idx === null) {
      this.undoRequest = null;
      this.broadcastUndoState();
      return;
    }
    const snap = this.turnSnapshots[idx]!;
    this.match = deserializeMatch(snap.match);
    this.rng = createSeededRng(snap.rng);
    this.turnSnapshots = this.turnSnapshots.slice(0, idx + 1);
    this.replay?.intents.splice(snap.intentCount);
    this.actedSinceSnapshot = false;
    this.undoRequest = null;
    this.log("info", "undo_applied", { matchId: this.matchId, by, toTurn: snap.turnNumber });

    const applied: UndoAppliedMessage = {
      protocolVersion: PROTOCOL_VERSION,
      toTurn: snap.turnNumber,
      by,
    };
    this.broadcast("undo_applied", applied);
    this.syncPublicState();
    this.broadcastViews([]);
    // A rewound turn gets a fresh turn clock; chess clocks keep their spent time.
    this.refreshTurnClock();
    this.updateSeatClock();
    this.ensureTimerLoop();
    this.broadcastTimer();
    this.broadcastUndoState();
  }

  private broadcastViews(events: GameEvent[]) {
    if (!this.match) return;
    for (const slot of this.seats) {
      if (!slot) continue;
      const client = this.clients.find((c) => c.sessionId === slot.sessionId);
      if (!client) continue;
      const view = getPlayerView(this.match, slot.seat);
      client.send("events", {
        protocolVersion: PROTOCOL_VERSION,
        events: projectGameEvents(events, slot.seat),
      });
      client.send("view", {
        protocolVersion: PROTOCOL_VERSION,
        view,
      });
    }
    for (const spec of this.spectators) {
      const client = this.clients.find((c) => c.sessionId === spec.sessionId);
      if (!client) continue;
      const view = this.spectatorView(this.match, spec.cameraSeat);
      client.send("events", {
        protocolVersion: PROTOCOL_VERSION,
        events: projectGameEvents(events, null),
      });
      client.send("view", {
        protocolVersion: PROTOCOL_VERSION,
        view,
      });
    }
  }


  private clearTimerLoop() {
    if (this.timerInterval) {
      clearInterval(this.timerInterval);
      this.timerInterval = null;
    }
  }

  private ensureTimerLoop() {
    if (this.timerInterval) return;
    if (this.turnSeconds == null && this.matchSeconds == null && this.seatSeconds == null) return;
    this.timerInterval = setInterval(() => this.tickTimers(), 250);
  }

  private armMatchClock() {
    if (this.matchSeconds == null) {
      this.matchEndsAt = null;
      return;
    }
    this.matchEndsAt = Date.now() + this.matchSeconds * 1000;
  }

  private refreshTurnClock() {
    if (!this.match || this.turnSeconds == null) {
      this.turnEndsAt = null;
      this.lastTimerActiveSeat = this.match?.activeSeat ?? null;
      return;
    }
    this.turnEndsAt = Date.now() + this.turnSeconds * 1000;
    this.lastTimerActiveSeat = this.match.activeSeat;
  }

  private onMatchAdvanced() {
    if (!this.match) return;
    if (this.match.winner !== null) {
      this.clearTimerLoop();
      this.turnEndsAt = null;
      this.stopSeatClock();
      this.broadcastTimer();
      return;
    }
    if (this.lastTimerActiveSeat !== this.match.activeSeat) {
      this.refreshTurnClock();
    }
    this.updateSeatClock();
    this.ensureTimerLoop();
    this.broadcastTimer();
  }

  private armSeatClocks() {
    const ms = (this.seatSeconds ?? 0) * 1000;
    this.seatRemainingMs = [ms, ms];
    this.clockSeat = null;
  }

  /** Bill the running seat for time spent since the last charge. */
  private chargeSeatClock(now = Date.now()) {
    if (this.clockSeat === null) return;
    const s = this.clockSeat;
    this.seatRemainingMs[s] = Math.max(0, this.seatRemainingMs[s] - (now - this.clockSince));
    this.clockSince = now;
  }

  /** Point the chess clock at whoever must act now (none during mulligan / after the end). */
  private updateSeatClock() {
    if (this.seatSeconds == null || !this.match) return;
    const now = Date.now();
    this.chargeSeatClock(now);
    const next =
      this.match.winner !== null || this.match.phase === "mulligan" ? null : this.actingSeatForTimer();
    if (next !== this.clockSeat) {
      this.clockSeat = next;
      this.clockSince = now;
    }
  }

  private stopSeatClock() {
    this.chargeSeatClock();
    this.clockSeat = null;
  }

  private timerPayload() {
    this.chargeSeatClock();
    const seatClocks = this.seatSeconds != null;
    return {
      protocolVersion: PROTOCOL_VERSION,
      turnSeconds: this.turnSeconds,
      matchSeconds: this.matchSeconds,
      turnEndsAt: this.turnEndsAt,
      matchEndsAt: this.matchEndsAt,
      activeSeat: this.match?.activeSeat ?? 0,
      seatSeconds: this.seatSeconds,
      seatRemainingMs: seatClocks ? ([...this.seatRemainingMs] as [number, number]) : null,
      clockSeat: seatClocks ? this.clockSeat : null,
      // Absolute deadline for the running clock (same convention as turnEndsAt).
      clockEndsAt:
        seatClocks && this.clockSeat !== null
          ? Date.now() + this.seatRemainingMs[this.clockSeat]
          : null,
    };
  }

  private broadcastTimer() {
    this.broadcast("timer", this.timerPayload());
  }

  /** Tell everyone which seats dropped and until when they may reconnect. */
  private broadcastPresence() {
    this.broadcast("presence", {
      protocolVersion: PROTOCOL_VERSION,
      awayUntil: [...this.awayUntil],
    });
  }

  private tickTimers() {
    if (!this.match || this.match.winner !== null || this.matchOverSent) {
      this.clearTimerLoop();
      return;
    }
    const now = Date.now();
    if (this.matchEndsAt != null && now >= this.matchEndsAt) {
      this.expireMatchClock();
      return;
    }
    if (this.clockSeat !== null) {
      this.chargeSeatClock(now);
      if (this.seatRemainingMs[this.clockSeat] <= 0) {
        this.expireSeatClock(this.clockSeat);
        return;
      }
    }
    if (this.turnEndsAt != null && now >= this.turnEndsAt) {
      this.expireTurnClock();
    }
  }

  private expireMatchClock() {
    if (!this.match || this.match.winner !== null) return;
    // The seat the game is waiting on loses: a pending choice's owner, the defender in a
    // block/counter step, or a seat that has not answered its mulligan. If neither seat has
    // answered its mulligan, the first player loses as before.
    const m = this.match;
    const bothMulliganing = m.phase === "mulligan" && !m.players[0].mulliganDone && !m.players[1].mulliganDone;
    const loser = bothMulliganing ? m.activeSeat : (this.actingSeatForTimer() ?? m.activeSeat);
    const winner = (1 - loser) as Seat;
    this.endReason = "match_timeout";
    this.match = {
      ...this.match,
      winner,
      winReason: "leader_battle_at_zero_life",
      phase: "game_over",
    };
    this.syncPublicState();
    this.undoRequest = null;
    this.broadcastUndoState();
    this.stopSeatClock();
    this.clearTimerLoop();
    this.broadcastTimer();
    this.log("info", "match_timeout", { matchId: this.matchId, winner, loser });
    this.maybeSendMatchOver();
  }

  /** A player's own time bank ran out: they lose. */
  private expireSeatClock(loser: Seat) {
    if (!this.match || this.match.winner !== null) return;
    const winner = (1 - loser) as Seat;
    this.endReason = "timeout";
    this.match = { ...this.match, winner, winReason: "leader_battle_at_zero_life", phase: "game_over" };
    this.syncPublicState();
    this.undoRequest = null;
    this.broadcastUndoState();
    this.stopSeatClock();
    this.clearTimerLoop();
    this.broadcastTimer();
    this.log("info", "seat_clock_timeout", { matchId: this.matchId, winner, loser });
    this.maybeSendMatchOver();
  }

  private expireTurnClock() {
    if (!this.match || !this.rng || this.match.winner !== null) return;
    const seat = this.actingSeatForTimer();
    if (seat === null) {
      // Nobody to auto-act; refresh so we do not tight-loop.
      this.refreshTurnClock();
      this.broadcastTimer();
      return;
    }
    const intent = this.autoIntentForSeat(seat);
    if (!intent) {
      this.refreshTurnClock();
      this.broadcastTimer();
      return;
    }
    this.log("info", "turn_timeout", {
      matchId: this.matchId,
      seat,
      intentType: intent.type,
    });
    const before = this.match;
    const result = applyIntent(before, intent, { seat, rng: this.rng });
    if (!result.ok) {
      this.refreshTurnClock();
      this.broadcastTimer();
      return;
    }
    this.match = result.state;
    this.replay?.intents.push({ seat, intent });
    this.recordTurnSnapshot();
    this.syncPublicState();
    this.broadcastViews(result.events);
    this.onMatchAdvanced();
    this.maybeSendMatchOver();
  }

  /** Seat that must act now (pending choice owner, or battle defender, or active). */
  private actingSeatForTimer(): Seat | null {
    if (!this.match) return null;
    const front = this.match.pendingChoices[0];
    if (front) return front.seat;
    if (
      (this.match.phase === "block" || this.match.phase === "counter") &&
      this.match.battle
    ) {
      return (1 - this.match.battle.attackerSeat) as Seat;
    }
    if (this.match.phase === "mulligan") {
      const p0 = this.match.players[0];
      const p1 = this.match.players[1];
      if (!p0.mulliganDone) return 0;
      if (!p1.mulliganDone) return 1;
      return null;
    }
    return this.match.activeSeat;
  }

  private autoIntentForSeat(seat: Seat): Intent | null {
    if (!this.match) return null;
    const legal = listLegalIntents(this.match, seat);
    const front = this.match.pendingChoices[0];
    if (front && front.seat === seat) {
      if (front.kind === "order_effects") {
        return legal.find((i) => i.type === "order_pending_effects") ?? null;
      }
      if (front.optional) {
        return { type: "resolve_pending_choice", accept: false };
      }
      // Mandatory structured prompts (On Play hand pick, etc.) cannot auto-resolve.
      const bareAccept = legal.find(
        (i) => i.type === "resolve_pending_choice" && i.accept,
      );
      if (!bareAccept) return null;
      return bareAccept;
    }
    if (this.match.phase === "mulligan") {
      return { type: "mulligan", doMulligan: false };
    }
    if (this.match.phase === "block") {
      return legal.find((i) => i.type === "pass_block") ?? null;
    }
    if (this.match.phase === "counter") {
      return legal.find((i) => i.type === "pass_counter") ?? null;
    }
    if (this.match.phase === "main") {
      return legal.find((i) => i.type === "end_turn") ?? null;
    }
    return null;
  }

  private maybeSendMatchOver() {
    if (!this.match || this.match.winner === null || this.matchOverSent || this.resultPending) return;
    const result = {
      winner: this.match.winner,
      reason: this.endReason ?? this.match.winReason ?? "unknown",
    };
    const autoDispose = this.autoDispose;
    this.autoDispose = false;
    this.resultPending = this.writebackResult(result.winner, result.reason).then(() => {
      this.matchOverSent = true;
      presence.markDirty();
      this.log("info", "match_end", { matchId: this.matchId, ...result });
      this.broadcast("match_over", { protocolVersion: PROTOCOL_VERSION, result });
      this.broadcastRematchState();
      this.autoDispose = autoDispose;
      if (autoDispose && this.clients.length === 0) void this.disconnect().catch(() => undefined);
    });
  }

  /** The two account ids a result or progress snapshot is saved under, or why it isn't saved. */
  protected ingestSeats(): [number, number] | { skip: string } {
    const s0 = this.matchUserIds?.[0];
    const s1 = this.matchUserIds?.[1];
    if (s0 == null || s1 == null) return { skip: "missing_user_ids" };
    // Skip ingest for synthetic legacy negative ids unless both are real (>0).
    if (s0 <= 0 || s1 <= 0) return { skip: "legacy_dev_users" };
    if (!getMatchOutboxDatabaseUrl() && process.env.NODE_ENV !== "production") return { skip: "local_outbox_disabled" };
    return [s0, s1];
  }

  private async writebackResult(winner: Seat, reason: string) {
    const seats = this.ingestSeats();
    if (!Array.isArray(seats)) {
      this.log(seats.skip === "legacy_dev_users" ? "info" : "warn", "match_ingest_skip", {
        matchId: this.matchId,
        reason: seats.skip,
      });
      return;
    }
    const [s0, s1] = seats;
    const payload = this.resultPayload(s0, s1, winner, reason);
    // Keep the immutable payload and room alive across transient database outages.
    // A process crash before the first commit remains outside this outbox guarantee.
    for (;;) {
      try {
        await this.persistMatchResult(payload);
        return;
      } catch {
        this.log("warn", "match_enqueue_failed", { matchId: this.matchId });
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
    }
  }

  /** Rematches share the room: key each game's result separately. */
  private gameKey(): string {
    return this.gameNumber > 1 ? `${this.matchId}-r${this.gameNumber - 1}` : this.matchId;
  }

  /**
   * Save the game's log so far (both seats' logs and the replay), so a game that
   * never reaches a result (server restart, both players gone) still has one.
   * Sent at the start of every turn and when the room closes without a result.
   */
  private saveProgress(): Promise<void> {
    const seats = this.ingestSeats();
    if (!Array.isArray(seats) || !this.replay) return Promise.resolve();
    return this.progress.push({ matchId: this.gameKey(), payload: this.progressPayload(seats[0], seats[1]) });
  }

  private progressPayload(s0: number, s1: number): MatchProgressPayload {
    return {
      seat0_user_id: s0,
      seat1_user_id: s1,
      ranked: this.ranked,
      seat0_leader_id: this.replay?.players[0].leaderId,
      seat1_leader_id: this.replay?.players[1].leaderId,
      turns: this.match?.turnNumber,
      replay: this.replay ? { ...this.replay, intents: [...this.replay.intents] } : undefined,
      seat_logs: this.seatLogs(),
    };
  }

  protected persistMatchProgress(matchId: string, payload: MatchProgressPayload): Promise<void> {
    return postMatchProgress(matchId, payload);
  }

  private resultPayload(s0: number, s1: number, winner: Seat, reason: string): MatchResultPayload {
    return {
      ...this.progressPayload(s0, s1),
      match_id: this.gameKey(),
      winner_seat: winner,
      reason,
      replay: this.replay ? { ...this.replay, intents: [...this.replay.intents], end: { winner, reason } } : undefined,
    };
  }

  /** Each player's turn-by-turn log for their match history, with the opponent's hidden cards hidden. */
  private seatLogs(): MatchResultPayload["seat_logs"] {
    if (!this.replay) return undefined;
    try {
      return [seatLog(this.replay, 0), seatLog(this.replay, 1)];
    } catch {
      this.log("warn", "seat_log_failed", { matchId: this.matchId });
      return undefined;
    }
  }

  protected persistMatchResult(payload: MatchResultPayload): Promise<void> {
    return postMatchResult(payload);
  }

  /** Who is here, for the friends list ("in a game", spectate). */
  presenceEntries(): PresenceEntry[] {
    const phase: PresenceEntry["phase"] = !this.matchStarted
      ? "waiting"
      : this.matchOverSent
        ? "finished"
        : "playing";
    const entries: PresenceEntry[] = [];
    for (const slot of this.seats) {
      if (!slot) continue;
      entries.push({ user_id: slot.userId, room_id: this.roomId, role: "player", phase, ranked: this.ranked });
    }
    for (const spec of this.spectators) {
      entries.push({ user_id: spec.userId, room_id: this.roomId, role: "spectator", phase, ranked: this.ranked });
    }
    return entries;
  }

  private syncPublicState() {
    if (!this.match) return;
    presence.markDirty();
    this.state.phase = this.match.phase;
    this.state.activeSeat = this.match.activeSeat;
    this.state.winner = this.match.winner === null ? -1 : this.match.winner;
  }

  private consumeRateLimit(sessionId: string): boolean {
    const now = Date.now();
    const windowStart = now - INTENT_RATE_WINDOW_MS;
    const prev = this.intentTimestamps.get(sessionId) ?? [];
    const recent = prev.filter((t) => t >= windowStart);
    if (recent.length >= INTENT_RATE_LIMIT) {
      this.intentTimestamps.set(sessionId, recent);
      return false;
    }
    recent.push(now);
    this.intentTimestamps.set(sessionId, recent);
    return true;
  }

  private sendSync(client: Client) {
    const spec = this.spectatorForClient(client);
    if (spec) {
      this.sendSpectatorSync(client, spec.cameraSeat);
      return;
    }
    const seat = this.seatForClient(client);
    if (seat === null || !this.match) {
      this.sendError(client, "match_not_ready", "Match not started");
      return;
    }
    const view = getPlayerView(this.match, seat);
    const welcome: WelcomeMessage = {
      protocolVersion: PROTOCOL_VERSION,
      matchId: this.matchId,
      seat,
      role: "player",
      view,
      players: this.playersInfo(),
    };
    client.send("welcome", welcome);
    client.send("view", {
      protocolVersion: PROTOCOL_VERSION,
      view,
    });
    this.sendStoredCosmetics(client);
    this.sendChatHistory(client);
    this.sendUndoState(client);
    client.send("timer", this.timerPayload());
    client.send("presence", { protocolVersion: PROTOCOL_VERSION, awayUntil: [...this.awayUntil] });
    if (this.match.winner !== null && this.matchOverSent) {
      client.send("match_over", {
        protocolVersion: PROTOCOL_VERSION,
        result: {
          winner: this.match.winner,
          reason: this.endReason ?? this.match.winReason ?? "unknown",
        },
      });
      if (!this.ranked) client.send("rematch_state", this.rematchState());
    }
  }

  /**
   * Spectators see both hands in unranked rooms. Ranked keeps hands hidden so a
   * spectator can't relay them to a player.
   */
  private spectatorView(match: MatchState, cameraSeat: Seat) {
    return getSpectatorView(match, cameraSeat, { revealHands: !this.ranked });
  }

  private sendSpectatorSync(client: Client, cameraSeat: Seat) {
    if (!this.match) {
      this.sendError(client, "match_not_ready", "Match not started");
      return;
    }
    const view = this.spectatorView(this.match, cameraSeat);
    const welcome: WelcomeMessage = {
      protocolVersion: PROTOCOL_VERSION,
      matchId: this.matchId,
      seat: cameraSeat,
      role: "spectator",
      view,
      players: this.playersInfo(),
    };
    client.send("welcome", welcome);
    client.send("view", {
      protocolVersion: PROTOCOL_VERSION,
      view,
    });
    this.sendStoredCosmetics(client);
    this.sendChatHistory(client);
    if (this.match.winner !== null && this.matchOverSent) {
      client.send("match_over", {
        protocolVersion: PROTOCOL_VERSION,
        result: {
          winner: this.match.winner,
          reason: this.endReason ?? this.match.winReason ?? "unknown",
        },
      });
    }
  }

  /** Seat-indexed public names for nameplates / results (never emails). */
  private playersInfo(): [SeatPlayerInfo, SeatPlayerInfo] {
    const info = (seat: Seat): SeatPlayerInfo => ({
      name: this.seats[seat]?.displayName ?? this.seatNames[seat] ?? null,
    });
    return [info(0), info(1)];
  }

  /** Turn a join away, with a log line so a stranded opponent can be traced. */
  private rejectJoin(client: Client, code: ErrorCode | string, message: string) {
    this.log("warn", "join_rejected", { matchId: this.matchId, sessionId: client.sessionId, code, message });
    this.sendError(client, code, message);
    client.leave();
  }

  private sendError(client: Client, code: ErrorCode | string, message: string) {
    client.send("error", {
      protocolVersion: PROTOCOL_VERSION,
      code,
      message,
    });
  }

  private log(
    level: "debug" | "info" | "warn",
    event: string,
    data: Record<string, unknown>,
  ) {
    const configured = getLogLevel();
    const order = { debug: 0, info: 1, warn: 2 } as const;
    if (order[level] < order[configured]) return;
    const line = JSON.stringify({
      ts: new Date().toISOString(),
      level,
      event,
      ...data,
    });
    if (level === "warn") console.warn(line);
    else console.log(line);
  }
}

/** Same check createMatch applies (unknown ids / non-Leader leaders), surfaced at join. */
function hashToNegativeId(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
  const n = Math.abs(h) % 1_000_000_000;
  return -1 - n;
}
