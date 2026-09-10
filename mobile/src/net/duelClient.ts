import { getDevJoinSecret, getGameServerUrl, PROTOCOL_VERSION } from "../config";
import {
  parseError,
  parseMatchOver,
  parseView,
  parseWelcome,
  type DuelCreateOptions,
  type DuelJoinOptions,
  type ErrorMessage,
  type Intent,
  type MatchOverMessage,
  type PlayerView,
  type Seat,
} from "./protocol";
import { Client, type Room } from "@colyseus/sdk";

export type DuelClientHandlers = {
  onWelcome?: (info: {
    matchId: string;
    seat: Seat;
    role?: "player" | "spectator";
    view: PlayerView;
  }) => void;
  onView?: (view: PlayerView) => void;
  onEvents?: (events: unknown[]) => void;
  onError?: (err: ErrorMessage) => void;
  onMatchOver?: (msg: MatchOverMessage) => void;
  onDisconnect?: (code: number) => void;
  onQueued?: (position: number) => void;
  onMatched?: (info: { roomId: string; seat: Seat; ranked: boolean }) => void;
};

export type ConnectParams = {
  serverUrl?: string;
  devUserId?: string;
  gameToken?: string;
  secret?: string;
  preferredSeat?: Seat;
  role?: "player" | "spectator";
  roomId?: string;
  createOptions?: DuelCreateOptions;
};

export class DuelClient {
  private client: Client | null = null;
  private room: Room | null = null;
  private queueRoom: Room | null = null;
  private handlers: DuelClientHandlers = {};
  private reconnectionToken: string | null = null;

  setHandlers(h: DuelClientHandlers) {
    this.handlers = h;
  }

  get roomId(): string | undefined {
    return this.room?.roomId;
  }

  getReconnectionToken(): string | null {
    return this.reconnectionToken;
  }

  async connect(params: ConnectParams): Promise<{ matchId: string; seat: Seat }> {
    await this.disconnect();

    const url = params.serverUrl ?? getGameServerUrl();
    this.client = new Client(url);

    const join = this.buildJoin(params);
    const create: DuelCreateOptions = {
      protocolVersion: PROTOCOL_VERSION,
      autoSkipMulligan: true,
      ...params.createOptions,
    };

    let room: Room;
    if (params.roomId?.trim()) {
      room = await this.client.joinById(params.roomId.trim(), join);
    } else {
      room = await this.client.joinOrCreate("duel", { ...create, ...join });
    }

    this.room = room;
    this.captureReconnectionToken(room);
    this.wireDuel(room);

    return this.waitWelcome(room);
  }

  /** Join ranked_queue until matched, then join the duel room. */
  async queueRanked(params: ConnectParams): Promise<{ matchId: string; seat: Seat }> {
    await this.disconnect();
    const url = params.serverUrl ?? getGameServerUrl();
    this.client = new Client(url);
    const join = this.buildJoin(params);

    const queueRoom = await this.client.joinOrCreate("ranked_queue", join);
    this.queueRoom = queueRoom;

    const matched = await new Promise<{ roomId: string; seat: Seat; ranked: boolean }>(
      (resolve, reject) => {
        const timer = setTimeout(() => reject(new Error("Queue timed out")), 120000);
        queueRoom.onMessage("queued", (msg: { position?: number }) => {
          this.handlers.onQueued?.(typeof msg?.position === "number" ? msg.position : 0);
        });
        queueRoom.onMessage(
          "matched",
          (msg: { roomId?: string; seat?: Seat; ranked?: boolean }) => {
            clearTimeout(timer);
            if (typeof msg?.roomId !== "string" || (msg.seat !== 0 && msg.seat !== 1)) {
              reject(new Error("Bad matched payload"));
              return;
            }
            resolve({
              roomId: msg.roomId,
              seat: msg.seat,
              ranked: msg.ranked !== false,
            });
          },
        );
        queueRoom.onError((code, message) => {
          clearTimeout(timer);
          reject(new Error(message || `queue error ${code}`));
        });
      },
    );

    this.handlers.onMatched?.(matched);
    try {
      await queueRoom.leave(true);
    } catch {
      /* ignore */
    }
    this.queueRoom = null;

    const room = await this.client.joinById(matched.roomId, {
      ...join,
      preferredSeat: matched.seat,
    });
    this.room = room;
    this.captureReconnectionToken(room);
    this.wireDuel(room);
    return this.waitWelcome(room);
  }

  async cancelQueue() {
    if (this.queueRoom) {
      try {
        this.queueRoom.send("cancel", {});
        await this.queueRoom.leave(true);
      } catch {
        /* ignore */
      }
      this.queueRoom = null;
    }
  }

  async reconnect(): Promise<{ matchId: string; seat: Seat }> {
    if (!this.client || !this.reconnectionToken) {
      throw new Error("No reconnection token");
    }
    const room = await this.client.reconnect(this.reconnectionToken);
    this.room = room;
    this.captureReconnectionToken(room);
    this.wireDuel(room);
    room.send("sync", { protocolVersion: PROTOCOL_VERSION });
    return this.waitWelcome(room);
  }

  sendIntent(intent: Intent) {
    if (!this.room) throw new Error("Not connected");
    this.room.send("intent", { protocolVersion: PROTOCOL_VERSION, intent });
  }

  concede() {
    if (!this.room) throw new Error("Not connected");
    this.room.send("concede", { protocolVersion: PROTOCOL_VERSION });
  }

  sync() {
    if (!this.room) throw new Error("Not connected");
    this.room.send("sync", { protocolVersion: PROTOCOL_VERSION });
  }

  ping(t = Date.now()) {
    this.room?.send("ping", { t });
  }

  async disconnect() {
    await this.cancelQueue();
    if (this.room) {
      try {
        await this.room.leave(true);
      } catch {
        /* ignore */
      }
      this.room = null;
    }
    this.client = null;
    this.reconnectionToken = null;
  }

  private buildJoin(params: ConnectParams): DuelJoinOptions {
    return {
      protocolVersion: PROTOCOL_VERSION,
      devUserId: params.devUserId?.trim() || undefined,
      gameToken: params.gameToken,
      secret: params.secret ?? getDevJoinSecret(),
      preferredSeat: params.preferredSeat,
      role: params.role,
    };
  }

  private captureReconnectionToken(room: Room) {
    const token = (room as { reconnectionToken?: string }).reconnectionToken;
    if (typeof token === "string" && token.length > 0) {
      this.reconnectionToken = token;
    }
  }

  private waitWelcome(room: Room): Promise<{ matchId: string; seat: Seat }> {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(
        () => reject(new Error("Timed out waiting for welcome")),
        12000,
      );
      const prev = this.handlers.onWelcome;
      this.handlers.onWelcome = (info) => {
        clearTimeout(timer);
        this.handlers.onWelcome = prev;
        prev?.(info);
        resolve({ matchId: info.matchId, seat: info.seat });
      };
      room.onError((code, message) => {
        clearTimeout(timer);
        reject(new Error(message || `room error ${code}`));
      });
    });
  }

  private wireDuel(room: Room) {
    room.onMessage("welcome", (raw: unknown) => {
      try {
        const msg = parseWelcome(raw);
        this.handlers.onWelcome?.({
          matchId: msg.matchId,
          seat: msg.seat,
          role: msg.role ?? (msg.view.spectator ? "spectator" : "player"),
          view: msg.view,
        });
        this.handlers.onView?.(msg.view);
      } catch (e) {
        this.handlers.onError?.({
          protocolVersion: PROTOCOL_VERSION,
          code: "bad_protocol",
          message: e instanceof Error ? e.message : "Bad welcome",
        });
      }
    });

    room.onMessage("view", (raw: unknown) => {
      try {
        const msg = parseView(raw);
        this.handlers.onView?.(msg.view);
      } catch (e) {
        this.handlers.onError?.({
          protocolVersion: PROTOCOL_VERSION,
          code: "bad_protocol",
          message: e instanceof Error ? e.message : "Bad view",
        });
      }
    });

    room.onMessage("events", (raw: unknown) => {
      if (raw && typeof raw === "object" && Array.isArray((raw as { events?: unknown }).events)) {
        this.handlers.onEvents?.((raw as { events: unknown[] }).events);
      }
    });

    room.onMessage("error", (raw: unknown) => {
      try {
        this.handlers.onError?.(parseError(raw));
      } catch {
        this.handlers.onError?.({
          protocolVersion: PROTOCOL_VERSION,
          code: "unknown",
          message: "Malformed error",
        });
      }
    });

    room.onMessage("match_over", (raw: unknown) => {
      try {
        this.handlers.onMatchOver?.(parseMatchOver(raw));
      } catch (e) {
        this.handlers.onError?.({
          protocolVersion: PROTOCOL_VERSION,
          code: "bad_protocol",
          message: e instanceof Error ? e.message : "Bad match_over",
        });
      }
    });

    room.onLeave((code) => {
      this.handlers.onDisconnect?.(code);
      this.room = null;
    });
  }
}
