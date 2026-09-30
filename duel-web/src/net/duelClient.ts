import { getDevJoinSecret, getGameServerUrl, PROTOCOL_VERSION } from "../config";
import {
  parseChat,
  parseChatHistory,
  parseCosmetics,
  parseSkin,
  parseError,
  parseMatchOver,
  parsePresence,
  parseRematchState,
  parseTimer,
  parseUndoApplied,
  parseUndoState,
  parseView,
  parseWelcome,
  type ArtPrefsMap,
  type ChatLine,
  type CosmeticsMessage,
  type SeatSkin,
  type SkinMessage,
  type DuelCreateOptions,
  type DuelJoinOptions,
  type ErrorMessage,
  type Intent,
  type MatchOverMessage,
  type PlayerView,
  type Seat,
  type SeatPlayers,
  type TimerMessage,
  type RematchAction,
  type RematchState,
  type UndoAction,
  type UndoState,
} from "./protocol";
import { Client, type Room } from "@colyseus/sdk";
import { isSeatReservationExpiredError } from "./matchResume";
import { noteReportGameToken, noteReportRoom } from "../cards/cardReport";

export type DuelClientHandlers = {
  onWelcome?: (info: {
    matchId: string;
    seat: Seat;
    view: PlayerView;
    role: "player" | "spectator";
    players?: SeatPlayers;
  }) => void;
  onView?: (view: PlayerView) => void;
  onEvents?: (events: unknown[]) => void;
  onError?: (err: ErrorMessage) => void;
  onMatchOver?: (msg: MatchOverMessage) => void;
  onCosmetics?: (msg: CosmeticsMessage) => void;
  onSkin?: (msg: SkinMessage) => void;
  onTimer?: (msg: TimerMessage) => void;
  /** New chat lines (a single relay, or the replayed history on join / sync). */
  onChat?: (lines: ChatLine[]) => void;
  /** Undo availability / open request (unranked rooms). */
  onUndoState?: (state: UndoState) => void;
  /** An accepted undo rewound the match to the start of `toTurn`. */
  onUndoApplied?: (info: { toTurn: number; by: Seat }) => void;
  /** Seats that dropped: epoch ms until which each may still reconnect. */
  onPresence?: (awayUntil: [number | null, number | null]) => void;
  /** Rematch vote after the match ends. */
  onRematchState?: (state: RematchState) => void;
  onDisconnect?: (code: number) => void;
  /** Socket dropped unexpectedly; the SDK is retrying in the background. */
  onDrop?: (code: number) => void;
  /** The SDK's background retry reclaimed the seat. */
  onReconnect?: () => void;
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
  private pendingReconnect: Promise<{ matchId: string; seat: Seat }> | null = null;

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
    const url = params.serverUrl ?? getGameServerUrl();
    const attempts = 3;
    let lastErr: unknown;

    for (let i = 0; i < attempts; i++) {
      if (i > 0) {
        await new Promise((r) => setTimeout(r, 400 * i));
      }
      try {
        await this.disconnect();
        this.client = new Client(url);

        const join = this.buildJoin(params);
        const create: DuelCreateOptions = {
          protocolVersion: PROTOCOL_VERSION,
          // Real matches use the rules mulligan step (Keep hand / redraw 5).
          autoSkipMulligan: false,
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
      } catch (e) {
        lastErr = e;
        // Free-tier cold starts: matchmake HTTP can succeed then WS consume
        // loses the 15–90s seat reservation race → retry a fresh create/join.
        if (!isSeatReservationExpiredError(e) || i === attempts - 1) throw e;
        try {
          await this.disconnect(true);
        } catch {
          /* ignore */
        }
      }
    }
    throw lastErr instanceof Error ? lastErr : new Error(String(lastErr));
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
  reconnect(opts?: {
    serverUrl?: string;
    reconnectionToken?: string;
    attempts?: number;
  }): Promise<{ matchId: string; seat: Seat }> {
    // Single flight: a second caller (StrictMode's double resume, or a tab
    // return racing the Reconnect button) would abandon the seat the first
    // just reclaimed and then present a token the server already rotated.
    if (!this.pendingReconnect) {
      this.pendingReconnect = this.reconnectOnce(opts).finally(() => {
        this.pendingReconnect = null;
      });
    }
    return this.pendingReconnect;
  }

  private async reconnectOnce(opts?: {
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
        this.abandonRoom();
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
        // Only retry the narrow race where reload beats allowReconnection setup.
        // Broad /reconnection/i matching caused 5×12s hangs on dead tokens and
        // tripped the Hotseat 25s startup watchdog with a generic timeout.
        const retryable = isSeatReservationExpiredError(msg);
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

  /** Publish this seat's custom playmat / card back for the opponent to see. */
  sendSkin(skin: SeatSkin) {
    if (!this.room) return;
    this.room.send("skin", { protocolVersion: PROTOCOL_VERSION, skin });
  }

  sendChat(text: string) {
    if (!this.room) throw new Error("Not connected");
    this.room.send("chat", { protocolVersion: PROTOCOL_VERSION, text });
  }

  sendRematch(action: RematchAction) {
    if (!this.room) throw new Error("Not connected");
    this.room.send("rematch", { protocolVersion: PROTOCOL_VERSION, action });
  }

  sendUndo(action: UndoAction) {
    if (!this.room) throw new Error("Not connected");
    this.room.send("undo", { protocolVersion: PROTOCOL_VERSION, action });
  }

  ping(t = Date.now()) {
    this.room?.send("ping", { t });
  }

  /** True while the SDK is retrying a dropped socket on its own. */
  get isReconnecting(): boolean {
    return Boolean(this.room?.reconnection?.isReconnecting);
  }

  /**
   * Round-trip a transport ping. A phone that was in another app can come back
   * with a socket that still reads OPEN but that the server already dropped;
   * nothing answers it, so resolve false after `timeoutMs`.
   */
  isAlive(timeoutMs = 3000): Promise<boolean> {
    const room = this.room;
    if (!room || !room.connection?.isOpen) return Promise.resolve(false);
    return new Promise((resolve) => {
      const timer = setTimeout(() => resolve(false), timeoutMs);
      room.ping(() => {
        clearTimeout(timer);
        resolve(true);
      });
    });
  }

  /**
   * Stop tracking the current room without a consented leave, so the server
   * keeps the seat for reclaim. Its late close / retry events are ignored.
   */
  private abandonRoom() {
    const room = this.room;
    if (!room) return;
    this.room = null;
    try {
      room.reconnection.enabled = false;
      room.connection?.close();
    } catch {
      /* already closed */
    }
  }

  /**
   * @param consented When true (default), leave with consent and drop the
   *   reconnection token. Pass `false` only for rare soft-teardowns where the
   *   server should keep reconnect grace (page reload uses neither — the tab dies).
   */
  async disconnect(consented = true) {
    // Detach first so a caller that doesn't await (Leave navigates at once)
    // can start a new match on this client while the old socket closes.
    const room = this.room;
    this.room = null;
    this.client = null;
    noteReportRoom(undefined);
    if (consented) this.reconnectionToken = null;
    await this.cancelQueue();
    if (room) {
      try {
        await room.leave(consented);
      } catch {
        /* ignore */
      }
    }
  }

  private buildJoin(params: ConnectParams): DuelJoinOptions {
    noteReportGameToken(params.gameToken);
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
    noteReportRoom(room.roomId);
    room.onMessage("welcome", (raw: unknown) => {
      try {
        const msg = parseWelcome(raw);
        this.handlers.onWelcome?.({
          matchId: msg.matchId,
          seat: msg.seat,
          view: msg.view,
          role: msg.role ?? (msg.view.spectator ? "spectator" : "player"),
          players: msg.players,
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

    room.onMessage("skin", (raw: unknown) => {
      try {
        this.handlers.onSkin?.(parseSkin(raw));
      } catch {
        // Cosmetic only — a bad skin never surfaces as a match error.
      }
    });

    room.onMessage("timer", (raw: unknown) => {
      try {
        this.handlers.onTimer?.(parseTimer(raw));
      } catch {
        /* ignore malformed timer snapshots */
      }
    });

    room.onMessage("chat", (raw: unknown) => {
      try {
        this.handlers.onChat?.([parseChat(raw)]);
      } catch {
        /* ignore malformed chat lines */
      }
    });

    room.onMessage("chat_history", (raw: unknown) => {
      try {
        this.handlers.onChat?.(parseChatHistory(raw));
      } catch {
        /* ignore malformed chat history */
      }
    });

    room.onMessage("rematch_state", (raw: unknown) => {
      try {
        this.handlers.onRematchState?.(parseRematchState(raw));
      } catch {
        /* ignore malformed rematch state */
      }
    });

    room.onMessage("presence", (raw: unknown) => {
      try {
        this.handlers.onPresence?.(parsePresence(raw));
      } catch {
        /* ignore malformed presence */
      }
    });

    room.onMessage("undo_state", (raw: unknown) => {
      try {
        this.handlers.onUndoState?.(parseUndoState(raw));
      } catch {
        /* ignore malformed undo state */
      }
    });

    room.onMessage("undo_applied", (raw: unknown) => {
      try {
        this.handlers.onUndoApplied?.(parseUndoApplied(raw));
      } catch {
        /* ignore malformed undo notice */
      }
    });

    room.onDrop((code) => {
      if (this.room !== room) return;
      this.handlers.onDrop?.(code);
    });

    room.onReconnect(() => {
      // The server issues a fresh token on every reclaim and the old one is
      // dead, but the SDK fires onReconnect before it stores the new token.
      queueMicrotask(() => {
        if (this.room !== room) return;
        this.captureReconnectionToken(room);
        this.handlers.onReconnect?.();
      });
    });

    room.onLeave((code) => {
      // A room we already detached from (Leave) must not clobber a newer one.
      if (this.room !== room) return;
      this.handlers.onDisconnect?.(code);
      this.room = null;
    });
  }
}
