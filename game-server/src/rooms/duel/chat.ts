import type { Client } from "colyseus";
import type { Seat } from "@optcg/rules";
import { SlidingWindowLimiter } from "../../rateLimit.js";
import { PROTOCOL_VERSION, parseChatMessage, type ChatMessage } from "../../protocol.js";
import type { DuelCore } from "./context.js";

const CHAT_RATE_LIMIT = 5;
const CHAT_RATE_WINDOW_MS = 5000;
const CHAT_HISTORY_LIMIT = 50;

/** The room's chat: relays lines to everyone, keeps the last few for joiners, rate-limits each sender. */
export class RoomChat {
  /** Recent chat lines, replayed on join / sync. Not persisted. */
  private chatLog: ChatMessage[] = [];
  private chatSeq = 0;
  private readonly limiter: SlidingWindowLimiter;

  constructor(private readonly core: Pick<DuelCore, "game" | "io" | "time">) {
    this.limiter = new SlidingWindowLimiter(CHAT_RATE_LIMIT, CHAT_RATE_WINDOW_MS, () => core.time.now());
  }

  /** A seated player's chat message. */
  handle(client: Client, seat: Seat, message: unknown) {
    const { game, io, time } = this.core;
    let text: string;
    try {
      text = parseChatMessage(message);
    } catch (e) {
      io.sendParseError(client, e);
      return;
    }
    if (!this.limiter.consume(client.sessionId)) {
      io.sendError(client, "rate_limited", "Slow down — too many chat messages");
      return;
    }
    this.chatSeq += 1;
    const line: ChatMessage = {
      protocolVersion: PROTOCOL_VERSION,
      id: `${game.matchId}-${this.chatSeq}`,
      seat,
      text,
      at: time.now(),
    };
    this.chatLog.push(line);
    if (this.chatLog.length > CHAT_HISTORY_LIMIT) this.chatLog.shift();
    // Relay to everyone (including sender and spectators).
    io.broadcast("chat", line);
  }

  sendHistory(client: Client) {
    if (this.chatLog.length === 0) return;
    client.send("chat_history", {
      protocolVersion: PROTOCOL_VERSION,
      messages: this.chatLog,
    });
  }

  /** A connection is gone: forget its rate-limit window. */
  forget(sessionId: string) {
    this.limiter.forget(sessionId);
  }
}
