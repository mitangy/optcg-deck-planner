import { Room, Client } from "colyseus";
import {
  applyIntent,
  buildTestDeck,
  createMatch,
  createSeededRng,
  getPlayerView,
  skipMulligans,
  type GameEvent,
  type Intent,
  type MatchState,
  type Rng,
  type Seat,
} from "@optcg/rules";
import { getDevJoinSecret, getLogLevel } from "../env.js";
import {
  PROTOCOL_VERSION,
  parseCreateOptions,
  parseIntentMessage,
  parseJoinOptions,
  type ErrorCode,
  type PlayerDeckWire,
  type WelcomeMessage,
} from "../protocol.js";
import { DuelPublicState } from "./schema/DuelPublicState.js";

type SeatSlot = {
  seat: Seat;
  sessionId: string;
  devUserId: string;
};

const INTENT_RATE_LIMIT = 20;
const INTENT_RATE_WINDOW_MS = 1000;

export class DuelRoom extends Room {
  maxClients = 2;
  state = new DuelPublicState();

  private match: MatchState | null = null;
  private rng: Rng | null = null;
  private matchId = "";
  private seed = 0;
  private autoSkipMulligan = true;
  private createPlayers: [PlayerDeckWire, PlayerDeckWire] | undefined;
  private seats: [SeatSlot | null, SeatSlot | null] = [null, null];
  private intentTimestamps = new Map<string, number[]>();
  private matchStarted = false;
  private matchOverSent = false;

  onCreate(options: unknown) {
    const parsed = parseCreateOptions(options);
    this.seed = parsed.seed;
    this.autoSkipMulligan = parsed.autoSkipMulligan;
    this.createPlayers = parsed.players;
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

    this.log("info", "room_created", { matchId: this.matchId, seed: this.seed });
  }

  onAuth(_client: Client, options: unknown) {
    let join;
    try {
      join = parseJoinOptions(options);
    } catch (e) {
      const err = e as Error & { code?: ErrorCode };
      throw new Error(err.message || "unauthorized");
    }
    const required = getDevJoinSecret();
    if (required && join.secret !== required) {
      throw new Error("unauthorized");
    }
    return { devUserId: join.devUserId, preferredSeat: join.preferredSeat };
  }

  onJoin(client: Client, options: unknown) {
    let join;
    try {
      join = parseJoinOptions(options);
    } catch (e) {
      const err = e as Error & { code?: ErrorCode };
      this.sendError(client, err.code ?? "bad_protocol", err.message);
      client.leave();
      return;
    }

    const seat = this.assignSeat(client.sessionId, join.devUserId, join.preferredSeat);
    if (seat === null) {
      this.sendError(client, "room_full", "No free seat");
      client.leave();
      return;
    }

    this.state.seatsFilled = (this.seats[0] ? 1 : 0) + (this.seats[1] ? 1 : 0);
    this.log("info", "player_joined", {
      matchId: this.matchId,
      seat,
      devUserId: join.devUserId,
      sessionId: client.sessionId,
    });

    if (this.seats[0] && this.seats[1] && !this.matchStarted) {
      this.startMatch();
    }
  }

  onLeave(client: Client) {
    for (let i = 0; i < 2; i++) {
      const slot = this.seats[i];
      if (slot && slot.sessionId === client.sessionId) {
        this.log("info", "player_left", {
          matchId: this.matchId,
          seat: i,
          sessionId: client.sessionId,
        });
        this.seats[i] = null;
      }
    }
    this.state.seatsFilled = (this.seats[0] ? 1 : 0) + (this.seats[1] ? 1 : 0);
    this.intentTimestamps.delete(client.sessionId);
  }

  onDispose() {
    this.log("info", "room_disposed", { matchId: this.matchId });
  }

  private assignSeat(
    sessionId: string,
    devUserId: string,
    preferred?: Seat,
  ): Seat | null {
    if (preferred === 0 || preferred === 1) {
      if (!this.seats[preferred]) {
        this.seats[preferred] = { seat: preferred, sessionId, devUserId };
        return preferred;
      }
    }
    for (const seat of [0, 1] as Seat[]) {
      if (!this.seats[seat]) {
        this.seats[seat] = { seat, sessionId, devUserId };
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
    const deckA = this.createPlayers?.[0]?.deck ?? buildTestDeck(20);
    const deckB = this.createPlayers?.[1]?.deck ?? buildTestDeck(20);
    const leaderA = this.createPlayers?.[0]?.leaderId ?? "leader_red_5k";
    const leaderB = this.createPlayers?.[1]?.leaderId ?? "leader_red_5k";

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
        view,
      };
      client.send("welcome", welcome);
      client.send("view", {
        protocolVersion: PROTOCOL_VERSION,
        view,
      });
    }

    this.maybeSendMatchOver();
  }

  private handleIntent(client: Client, message: unknown) {
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
  }

  private maybeSendMatchOver() {
    if (!this.match || this.match.winner === null || this.matchOverSent) return;
    this.matchOverSent = true;
    const result = {
      winner: this.match.winner,
      reason: this.match.winReason ?? "unknown",
    };
    this.log("info", "match_end", { matchId: this.matchId, ...result });
    this.broadcast("match_over", {
      protocolVersion: PROTOCOL_VERSION,
      result,
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
