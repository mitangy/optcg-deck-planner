import { Room, Client, matchMaker } from "colyseus";
import { getDevJoinSecret, getLogLevel, requireGameToken } from "../env.js";
import { verifyGameToken } from "../gameToken.js";
import { PROTOCOL_VERSION, parseJoinOptions } from "../protocol.js";

type Queued = {
  sessionId: string;
  client: Client;
  userId: number;
  displayId: string;
  joinedAt: number;
};

/**
 * Ranked FIFO queue. When two clients are waiting, create a `duel` room and
 * tell each client to `joinById` with their preferred seat.
 */
export class MatchmakerRoom extends Room {
  maxClients = 64;
  private queue: Queued[] = [];
  private pairing = false;

  onCreate() {
    this.onMessage("cancel", (client) => {
      this.removeFromQueue(client.sessionId);
      client.send("queue_cancelled", { protocolVersion: PROTOCOL_VERSION });
    });
    this.log("info", "matchmaker_created", {});
  }

  onAuth(_client: Client, options: unknown) {
    // Validate early; return identity for onJoin.
    return this.resolveIdentity(options);
  }

  onJoin(client: Client, options: unknown) {
    const identity = this.resolveIdentity(options);
    this.removeFromQueue(client.sessionId);
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
          const room = await matchMaker.createRoom("duel", {
            protocolVersion: PROTOCOL_VERSION,
            autoSkipMulligan: false,
            ranked: true,
            seatUserIds: [a.userId, b.userId],
          });
          a.client.send("matched", {
            protocolVersion: PROTOCOL_VERSION,
            roomId: room.roomId,
            seat: 0,
            ranked: true,
          });
          b.client.send("matched", {
            protocolVersion: PROTOCOL_VERSION,
            roomId: room.roomId,
            seat: 1,
            ranked: true,
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
