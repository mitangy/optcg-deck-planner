import { Room, Client, matchMaker } from "colyseus";
import {
  getDevJoinSecret,
  getRankedMatchCreateSecret,
  getSeatReservationSeconds,
  requireGameToken,
} from "../env.js";
import { hashToNegativeId } from "../devIdentity.js";
import { verifyGameToken } from "../gameToken.js";
import { checkMatchmakeToken } from "../matchmakeGuard.js";
import { assertKnownDeck, rankedDeckProblem } from "../rankedDeck.js";
import { PROTOCOL_VERSION, RANKED_SEAT_SECONDS, parseJoinOptions, type QueueMode } from "../protocol.js";
import { writeLog, type LogLevel } from "../log.js";

type Queued = {
  sessionId: string;
  client: Client;
  userId: number;
  displayId: string;
  joinedAt: number;
};

export class MatchmakerRoom extends Room {
  // One queue room serves every process in a pool (found through the Redis
  // driver), so it must hold everyone queued at once: a second room would
  // split the queue into two that never pair with each other.
  maxClients = 5000;
  maxMessagesPerSecond = 10;
  private queue: Queued[] = [];
  /** Ranked unless a subclass says otherwise: the ranked pool must behave exactly as it always has. */
  protected readonly queueMode: QueueMode = "ranked";

  static async onAuth(_token: string, options: unknown): Promise<unknown> {
    return checkMatchmakeToken(options);
  }
  private pairing = false;

  onCreate() {
    this.seatReservationTimeout = getSeatReservationSeconds();

    this.onMessage("cancel", (client) => {
      this.removeFromQueue(client.sessionId);
      client.send("queue_cancelled", { protocolVersion: PROTOCOL_VERSION });
    });
    this.log("info", "matchmaker_created", { mode: this.queueMode });
  }

  onAuth(_client: Client, options: unknown) {
    try {
      return this.resolveIdentity(options);
    } catch (e) {
      this.log("warn", "queue_rejected", {
        message: e instanceof Error ? e.message : String(e),
      });
      throw e;
    }
  }

  onJoin(client: Client, options: unknown) {
    const identity = this.resolveIdentity(options);
    this.removeFromQueue(client.sessionId);
    // One place in the queue per account: an older entry (another tab, a stale
    // socket) is dropped, so one token can't fill the queue with ghosts that pair
    // real players into no-show rooms.
    for (const old of this.queue.filter((q) => q.userId === identity.userId)) {
      this.removeFromQueue(old.sessionId);
      old.client.leave();
    }
    this.queue.push({
      sessionId: client.sessionId,
      client,
      userId: identity.userId,
      displayId: identity.displayId,
      joinedAt: Date.now(),
    });
    client.send("queued", {
      protocolVersion: PROTOCOL_VERSION,
      position: this.queue.length,
    });
    this.log("info", "queue_join", {
      userId: identity.userId,
      displayId: identity.displayId,
      depth: this.queue.length,
    });
    void this.tryPair();
  }

  onLeave(client: Client) {
    this.removeFromQueue(client.sessionId);
  }

  private resolveIdentity(options: unknown): {
    userId: number;
    displayId: string;
  } {
    const join = parseJoinOptions(options);
    // Check the deck before queueing: a deck the room would turn away gets
    // paired, never joins, and strands its opponent. A casual room takes any
    // deck it can run, like a private room; only ranked adds the construction rules.
    if (join.deck) {
      assertKnownDeck(join.deck);
      const problem = this.queueMode === "ranked" ? rankedDeckProblem(join.deck) : null;
      if (problem) throw new Error(problem);
    }
    const requiredSecret = getDevJoinSecret();
    if (requiredSecret && join.secret !== requiredSecret) {
      throw new Error("unauthorized");
    }
    if (join.gameToken) {
      const payload = verifyGameToken(join.gameToken);
      if (!payload) throw new Error("invalid game token");
      return { userId: payload.uid, displayId: payload.email };
    }
    if (requireGameToken()) throw new Error("gameToken required");
    const displayId = join.devUserId!;
    return { userId: hashToNegativeId(displayId), displayId };
  }

  private removeFromQueue(sessionId: string) {
    this.queue = this.queue.filter((q) => q.sessionId !== sessionId);
  }

  private async tryPair() {
    if (this.pairing) return;
    this.pairing = true;
    try {
      while (this.queue.length >= 2) {
        const a = this.queue.shift()!;
        const partnerIdx = this.queue.findIndex((q) => q.userId !== a.userId);
        if (partnerIdx < 0) {
          // No distinct opponent yet (two tabs / hash collision) — wait for another joiner.
          this.queue.unshift(a);
          a.client.send("queued", {
            protocolVersion: PROTOCOL_VERSION,
            position: 1,
          });
          break;
        }
        const b = this.queue.splice(partnerIdx, 1)[0]!;
        try {
          const ranked = this.queueMode === "ranked";
          const room = await matchMaker.createRoom("duel", {
            protocolVersion: PROTOCOL_VERSION,
            autoSkipMulligan: false,
            ranked,
            // Only this attestation makes a room count for ratings; a casual room carries none.
            ...(ranked ? { rankedAttestation: getRankedMatchCreateSecret() } : {}),
            seatUserIds: [a.userId, b.userId],
            // Ranked always enforces a 15 minute chess clock per player (also forced in parseCreateOptions).
            // Casual strangers get the same clock so nobody can stall a game forever.
            timer: { seatSeconds: RANKED_SEAT_SECONDS },
          });
          a.client.send("matched", {
            protocolVersion: PROTOCOL_VERSION,
            roomId: room.roomId,
            seat: 0,
            ranked,
          });
          b.client.send("matched", {
            protocolVersion: PROTOCOL_VERSION,
            roomId: room.roomId,
            seat: 1,
            ranked,
          });
          this.log("info", "matched", {
            roomId: room.roomId,
            seat0: a.userId,
            seat1: b.userId,
          });
          // Clients leave the queue room themselves after handling `matched`.
        } catch (e) {
          this.log("warn", "match_create_failed", {
            message: e instanceof Error ? e.message : String(e),
          });
          this.queue.unshift(b, a);
          break;
        }
      }
    } finally {
      this.pairing = false;
    }
  }

  private log(level: LogLevel, event: string, data: Record<string, unknown>) {
    writeLog(level, event, data);
  }
}

/** The casual pool: the same pairing, but its rooms are unranked, so no rating moves. */
export class CasualMatchmakerRoom extends MatchmakerRoom {
  protected override readonly queueMode: QueueMode = "casual";
}
