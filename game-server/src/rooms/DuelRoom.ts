import { Room, Client } from "colyseus";
import {
  applyIntent,
  buildTestDeck,
  createMatch,
  createSeededRng,
  DEFAULT_LEADER_ID,
  getPlayerView,
  getSpectatorView,
  skipMulligans,
  type GameEvent,
  type Intent,
  type MatchState,
  type Rng,
  type Seat,
} from "@optcg/rules";
import {
  getDevJoinSecret,
  getLogLevel,
  getReconnectGraceSeconds,
  requireGameToken,
} from "../env.js";
import { verifyGameToken } from "../gameToken.js";
import {
  PROTOCOL_VERSION,
  parseCreateOptions,
  parseIntentMessage,
  parseJoinOptions,
  type ErrorCode,
  type PlayerDeckWire,
  type WelcomeMessage,
} from "../protocol.js";
import { postMatchResult } from "../writeback.js";
import { DuelPublicState } from "./schema/DuelPublicState.js";

type SeatSlot = {
  seat: Seat;
  sessionId: string;
  /** Stable player key for logs / legacy. */
  displayId: string;
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

export class DuelRoom extends Room {
  maxClients = 2 + MAX_SPECTATORS;
  state = new DuelPublicState();

  private match: MatchState | null = null;
  private rng: Rng | null = null;
  private matchId = "";
  private seed = 0;
  private autoSkipMulligan = true;
  private ranked = true;
  private createPlayers: [PlayerDeckWire, PlayerDeckWire] | undefined;
  private seatDecks: [PlayerDeckWire | null, PlayerDeckWire | null] = [null, null];
  private presetSeatUserIds: [number, number] | undefined;
  private seats: [SeatSlot | null, SeatSlot | null] = [null, null];
  private spectators: SpectatorSlot[] = [];
  private intentTimestamps = new Map<string, number[]>();
  private matchStarted = false;
  private matchOverSent = false;
  private endReason: string | null = null;

  onCreate(options: unknown) {
    const parsed = parseCreateOptions(options);
    this.seed = parsed.seed;
    this.autoSkipMulligan = parsed.autoSkipMulligan;
    this.createPlayers = parsed.players;
    if (parsed.players) {
      this.seatDecks = [parsed.players[0], parsed.players[1]];
    }
    this.ranked = parsed.ranked;
    this.presetSeatUserIds = parsed.seatUserIds;
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

    this.log("info", "room_created", {
      matchId: this.matchId,
      seed: this.seed,
      ranked: this.ranked,
    });
  }

  onAuth(_client: Client, options: unknown) {
    return this.resolveIdentity(options);
  }

  onJoin(client: Client, options: unknown) {
    let identity: {
      displayId: string;
      userId: number;
      preferredSeat?: Seat;
      role: "player" | "spectator";
      deck?: PlayerDeckWire;
    };
    try {
      identity = this.resolveIdentity(options);
    } catch (e) {
      const err = e as Error & { code?: ErrorCode };
      this.sendError(client, err.code ?? "bad_protocol", err.message);
      client.leave();
      return;
    }

    // Reclaim after allowReconnection: same sessionId may already be seated.
    const existingSeat = this.seatForClient(client);
    if (existingSeat !== null) {
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
        this.sendError(client, "room_full", "Spectator cap reached");
        client.leave();
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

    const seat = this.assignSeat(
      client.sessionId,
      identity.displayId,
      identity.userId,
      identity.preferredSeat,
    );
    if (seat === null) {
      this.sendError(client, "room_full", "No free seat");
      client.leave();
      return;
    }

    if (identity.deck) {
      this.seatDecks[seat] = identity.deck;
    }

    this.state.seatsFilled = (this.seats[0] ? 1 : 0) + (this.seats[1] ? 1 : 0);
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
    if (this.seatForClient(client) === null) return;
    this.clearSeat(client.sessionId);
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

    if (this.matchOverSent || !this.matchStarted) {
      this.clearSeat(client.sessionId);
      return;
    }

    const grace = getReconnectGraceSeconds();
    this.log("info", "player_disconnected", {
      matchId: this.matchId,
      seat,
      graceSeconds: grace,
    });
    try {
      await this.allowReconnection(client, grace);
      this.log("info", "player_reclaim_ok", {
        matchId: this.matchId,
        seat,
        sessionId: client.sessionId,
      });
      this.sendSync(client);
    } catch {
      this.log("info", "player_reclaim_timeout", {
        matchId: this.matchId,
        seat,
      });
      this.clearSeat(client.sessionId);
    }
  }

  onDispose() {
    this.log("info", "room_disposed", { matchId: this.matchId });
  }

  private resolveIdentity(options: unknown): {
    displayId: string;
    userId: number;
    preferredSeat?: Seat;
    role: "player" | "spectator";
    deck?: PlayerDeckWire;
  } {
    const join = parseJoinOptions(options);
    const role = join.role ?? "player";
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
    this.intentTimestamps.delete(sessionId);
  }

  private clearSpectator(sessionId: string) {
    const before = this.spectators.length;
    this.spectators = this.spectators.filter((s) => s.sessionId !== sessionId);
    if (this.spectators.length !== before) {
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
    userId: number,
    preferred?: Seat,
  ): Seat | null {
    if (preferred === 0 || preferred === 1) {
      if (!this.seats[preferred]) {
        this.seats[preferred] = { seat: preferred, sessionId, displayId, userId };
        return preferred;
      }
    }
    for (const seat of [0, 1] as Seat[]) {
      if (!this.seats[seat]) {
        this.seats[seat] = { seat, sessionId, displayId, userId };
        return seat;
      }
    }
    return null;
  }

  private seatForClient(client: Client): Seat | null {
    for (const slot of this.seats) {
      if (slot && slot.sessionId === client.sessionId) return slot.seat;
    }
    return null;
  }

  private startMatch() {
    this.matchStarted = true;
    this.rng = createSeededRng(this.seed);
    const deckA = this.seatDecks[0]?.deck ?? this.createPlayers?.[0]?.deck ?? buildTestDeck(20);
    const deckB = this.seatDecks[1]?.deck ?? this.createPlayers?.[1]?.deck ?? buildTestDeck(20);
    const leaderA =
      this.seatDecks[0]?.leaderId ?? this.createPlayers?.[0]?.leaderId ?? DEFAULT_LEADER_ID;
    const leaderB =
      this.seatDecks[1]?.leaderId ?? this.createPlayers?.[1]?.leaderId ?? DEFAULT_LEADER_ID;

    let match = createMatch({
      seed: this.seed,
      firstSeat: 0,
      players: [
        { leaderId: leaderA, deck: [...deckA] },
        { leaderId: leaderB, deck: [...deckB] },
      ],
    });

    if (this.autoSkipMulligan) {
      match = skipMulligans(match, this.rng);
    }

    this.match = match;
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
      };
      client.send("welcome", welcome);
      client.send("view", {
        protocolVersion: PROTOCOL_VERSION,
        view,
      });
    }

    for (const spec of this.spectators) {
      const client = this.clients.find((c) => c.sessionId === spec.sessionId);
      if (!client) continue;
      this.sendSpectatorSync(client, spec.cameraSeat);
    }

    this.maybeSendMatchOver();
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
    this.syncPublicState();
    this.broadcastViews(result.events);
    this.maybeSendMatchOver();
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
        events,
      });
      client.send("view", {
        protocolVersion: PROTOCOL_VERSION,
        view,
      });
    }
    for (const spec of this.spectators) {
      const client = this.clients.find((c) => c.sessionId === spec.sessionId);
      if (!client) continue;
      const view = getSpectatorView(this.match, spec.cameraSeat);
      client.send("events", {
        protocolVersion: PROTOCOL_VERSION,
        events,
      });
      client.send("view", {
        protocolVersion: PROTOCOL_VERSION,
        view,
      });
    }
  }

  private maybeSendMatchOver() {
    if (!this.match || this.match.winner === null || this.matchOverSent) return;
    this.matchOverSent = true;
    const result = {
      winner: this.match.winner,
      reason: this.endReason ?? this.match.winReason ?? "unknown",
    };
    this.log("info", "match_end", { matchId: this.matchId, ...result });
    this.broadcast("match_over", {
      protocolVersion: PROTOCOL_VERSION,
      result,
    });
    void this.writebackResult(result.winner, result.reason);
  }

  private async writebackResult(winner: Seat, reason: string) {
    const s0 = this.seats[0]?.userId ?? this.presetSeatUserIds?.[0];
    const s1 = this.seats[1]?.userId ?? this.presetSeatUserIds?.[1];
    if (s0 == null || s1 == null) {
      this.log("warn", "match_ingest_skip", {
        matchId: this.matchId,
        reason: "missing_user_ids",
      });
      return;
    }
    // Skip ingest for synthetic legacy negative ids unless both are real (>0).
    if (s0 <= 0 || s1 <= 0) {
      this.log("info", "match_ingest_skip", {
        matchId: this.matchId,
        reason: "legacy_dev_users",
      });
      return;
    }
    await postMatchResult({
      match_id: this.matchId,
      seat0_user_id: s0,
      seat1_user_id: s1,
      winner_seat: winner,
      reason,
      ranked: this.ranked,
    });
  }

  private syncPublicState() {
    if (!this.match) return;
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
    };
    client.send("welcome", welcome);
    client.send("view", {
      protocolVersion: PROTOCOL_VERSION,
      view,
    });
    if (this.match.winner !== null) {
      client.send("match_over", {
        protocolVersion: PROTOCOL_VERSION,
        result: {
          winner: this.match.winner,
          reason: this.match.winReason ?? "unknown",
        },
      });
    }
  }

  private sendSpectatorSync(client: Client, cameraSeat: Seat) {
    if (!this.match) {
      this.sendError(client, "match_not_ready", "Match not started");
      return;
    }
    const view = getSpectatorView(this.match, cameraSeat);
    const welcome: WelcomeMessage = {
      protocolVersion: PROTOCOL_VERSION,
      matchId: this.matchId,
      seat: cameraSeat,
      role: "spectator",
      view,
    };
    client.send("welcome", welcome);
    client.send("view", {
      protocolVersion: PROTOCOL_VERSION,
      view,
    });
    if (this.match.winner !== null) {
      client.send("match_over", {
        protocolVersion: PROTOCOL_VERSION,
        result: {
          winner: this.match.winner,
          reason: this.match.winReason ?? "unknown",
        },
      });
    }
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

function hashToNegativeId(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
  const n = Math.abs(h) % 1_000_000_000;
  return -1 - n;
}
