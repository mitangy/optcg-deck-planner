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
  onWelcome?: (info: { matchId: string; seat: Seat; view: PlayerView }) => void;
  onView?: (view: PlayerView) => void;
  onEvents?: (events: unknown[]) => void;
  onError?: (err: ErrorMessage) => void;
  onMatchOver?: (msg: MatchOverMessage) => void;
  onDisconnect?: (code: number) => void;
};

export type ConnectParams = {
  serverUrl?: string;
  devUserId: string;
  secret?: string;
  preferredSeat?: Seat;
  roomId?: string;
  createOptions?: DuelCreateOptions;
};

export class DuelClient {
  private client: Client | null = null;
  private room: Room | null = null;
  private handlers: DuelClientHandlers = {};

  setHandlers(h: DuelClientHandlers) {
    this.handlers = h;
  }

  get roomId(): string | undefined {
    return this.room?.roomId;
  }

  async connect(params: ConnectParams): Promise<{ matchId: string; seat: Seat }> {
    await this.disconnect();

    const url = params.serverUrl ?? getGameServerUrl();
    this.client = new Client(url);

    const join: DuelJoinOptions = {
      protocolVersion: PROTOCOL_VERSION,
      devUserId: params.devUserId.trim(),
      secret: params.secret ?? getDevJoinSecret(),
      preferredSeat: params.preferredSeat,
    };

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
    this.wire(room);

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

  sendIntent(intent: Intent) {
    if (!this.room) throw new Error("Not connected");
    this.room.send("intent", { protocolVersion: PROTOCOL_VERSION, intent });
  }

  sync() {
    if (!this.room) throw new Error("Not connected");
    this.room.send("sync", { protocolVersion: PROTOCOL_VERSION });
  }

  ping(t = Date.now()) {
    this.room?.send("ping", { t });
  }

  async disconnect() {
    if (this.room) {
      try {
        await this.room.leave(true);
      } catch {
        /* ignore */
      }
      this.room = null;
    }
    this.client = null;
  }

  private wire(room: Room) {
    room.onMessage("welcome", (raw: unknown) => {
      try {
        const msg = parseWelcome(raw);
        this.handlers.onWelcome?.({
          matchId: msg.matchId,
          seat: msg.seat,
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
