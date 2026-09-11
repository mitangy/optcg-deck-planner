import { getDevJoinSecret, getGameServerUrl, PROTOCOL_VERSION } from "../config";
import {
  parseCosmetics,
  parseError,
  parseMatchOver,
  parseView,
  parseWelcome,
  type ArtPrefsMap,
  type CosmeticsMessage,
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
    view: PlayerView;
    role: "player" | "spectator";
  }) => void;
  onView?: (view: PlayerView) => void;
  onEvents?: (events: unknown[]) => void;
  onError?: (err: ErrorMessage) => void;
  onMatchOver?: (msg: MatchOverMessage) => void;
  onCosmetics?: (msg: CosmeticsMessage) => void;
  onDisconnect?: (code: number) => void;
  onQueued?: (position: number) => void;
  onMatched?: (info: { roomId: string; seat: Seat; ranked: boolean }) => void;
  /** Fired whenever Colyseus issues/refreshes a reconnection token. */
  onReconnectionToken?: (token: string, roomId: string) => void;
};

export type ConnectParams = {
  serverUrl?: string;
  devUserId?: string;
  gameToken?: string;
  secret?: string;
  preferredSeat?: Seat;
  roomId?: string;
  role?: "player" | "spectator";
  createOptions?: DuelCreateOptions;
  /** Deck for this seat (create or join). */
  deck?: { leaderId: string; deck: string[] };
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
      // Always `create` for the host seat so StrictMode remounts / leftover
      // reconnect-grace rooms are not re-joined while locked at maxClients.
      room = await this.client.create("duel", { ...create, ...join });
    }

    this.room = room;
    this.captureReconnectionToken(room);
    this.wireDuel(room);

    // Resolve as soon as the Colyseus room exists so the lobby can show the
    // room id while waiting for the second seat (welcome arrives via handlers).
    return { matchId: room.roomId, seat: params.preferredSeat ?? 0 };
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
    return { matchId: room.roomId, seat: matched.seat };
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

  /**
   * Rejoin after an unexpected drop / page reload.
   * Pass `reconnectionToken` + `serverUrl` when restoring from sessionStorage
   * (the in-memory Client is gone after refresh).
   *
   * Retries on "seat reservation expired" — full page reload can race the
   * server's `allowReconnection` setup by a few dozen ms.
   */
  async reconnect(opts?: {
    serverUrl?: string;
    reconnectionToken?: string;
    attempts?: number;
  }): Promise<{ matchId: string; seat: Seat }> {
    const token = opts?.reconnectionToken ?? this.reconnectionToken;
    if (!token) throw new Error("No reconnection token");
    const url = opts?.serverUrl ?? getGameServerUrl();
    const attempts = opts?.attempts ?? 5;
    let lastErr: unknown;
    for (let i = 0; i < attempts; i++) {
      if (i > 0) {
        await new Promise((r) => setTimeout(r, 100 * i));
      }
      try {
        this.client = new Client(url);
        this.reconnectionToken = token;
        const room = await this.client.reconnect(token);
        this.room = room;
        this.captureReconnectionToken(room);
        this.wireDuel(room);
        room.send("sync", { protocolVersion: PROTOCOL_VERSION });
        return await this.waitWelcome(room);
      } catch (e) {
        lastErr = e;
        const msg = e instanceof Error ? e.message : String(e);
        const retryable = /seat reservation expired|reconnection/i.test(msg);
        if (!retryable || i === attempts - 1) throw e;
        try {
          await this.disconnect(false);
        } catch {
          /* ignore */
        }
      }
    }
    throw lastErr instanceof Error ? lastErr : new Error(String(lastErr));
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

  /** Publish this seat's alt-art prefs (non-authoritative cosmetics). */
  sendCosmetics(artPrefs: ArtPrefsMap) {
    if (!this.room) return;
    this.room.send("cosmetics", {
      protocolVersion: PROTOCOL_VERSION,
      artPrefs,
    });
  }

  ping(t = Date.now()) {
    this.room?.send("ping", { t });
  }

  /**
   * @param consented When true (default), leave with consent and drop the
   *   reconnection token. Pass `false` only for rare soft-teardowns where the
   *   server should keep reconnect grace (page reload uses neither — the tab dies).
   */
  async disconnect(consented = true) {
    await this.cancelQueue();
    if (this.room) {
      try {
        await this.room.leave(consented);
      } catch {
        /* ignore */
      }
      this.room = null;
    }
    this.client = null;
    if (consented) this.reconnectionToken = null;
  }

  private buildJoin(params: ConnectParams): DuelJoinOptions {
    return {
      protocolVersion: PROTOCOL_VERSION,
      devUserId: params.devUserId?.trim() || undefined,
      gameToken: params.gameToken,
      secret: params.secret ?? getDevJoinSecret(),
      preferredSeat: params.preferredSeat,
      role: params.role,
      deck: params.deck,
    };
  }

  private captureReconnectionToken(room: Room) {
    const token = (room as { reconnectionToken?: string }).reconnectionToken;
    if (typeof token === "string" && token.length > 0) {
      this.reconnectionToken = token;
      this.handlers.onReconnectionToken?.(token, room.roomId);
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
          view: msg.view,
          role: msg.role ?? (msg.view.spectator ? "spectator" : "player"),
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

    room.onMessage("cosmetics", (raw: unknown) => {
      try {
        this.handlers.onCosmetics?.(parseCosmetics(raw));
      } catch (e) {
        this.handlers.onError?.({
          protocolVersion: PROTOCOL_VERSION,
          code: "bad_protocol",
          message: e instanceof Error ? e.message : "Bad cosmetics",
        });
      }
    });

    room.onLeave((code) => {
      this.handlers.onDisconnect?.(code);
      this.room = null;
    });
  }
}
