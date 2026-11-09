/**
 * The client's picture of one match, as a pure reducer plus a tiny store.
 *
 * Online play (DuelSession), practice (HotseatSession, one store per seat) and the demo page all feed the same
 * `matchReducer`, so a protocol change is one edit. There is no React and no socket in here: sockets and session
 * side effects (resume blobs, cosmetics, launch generation) stay in their owners, which `dispatch` what they
 * received. Read it in components with `useMatch` / `useMatchStore` (state/useMatch.ts).
 */
import {
  indexViewInstances,
  narrateEvents,
  rewindBattleLog,
  type BattleLogEntry,
  type InstanceIndex,
} from "../board/match/battleLog";
import { isSeatReservationExpiredError } from "../net/matchResume";
import type {
  BriefTicketWire,
  ChatLine,
  DiceResult,
  DiceStateMessage,
  ErrorMessage,
  MatchOverMessage,
  PlayerView,
  RematchState,
  Seat,
  SeatPlayers,
  SeatSkin,
  SkinMessage,
  TimerMessage,
  UndoApplied,
  UndoState,
} from "../net/protocol";

/** Who feeds the store; only the welcome rule below differs (see `welcome`). */
export type MatchMode = "online" | "hotseat" | "demo";

export type MatchState = {
  mode: MatchMode;
  connected: boolean;
  /** Another device took this seat over (#451): the board is frozen and nothing reconnects. */
  takenOver: boolean;
  queueing: boolean;
  canReconnect: boolean;
  /** True while a sessionStorage resume is in flight (blocks lobby redirect). */
  resuming: boolean;
  /** True while the socket dropped and a reclaim of the seat is in flight. */
  reconnecting: boolean;
  matchId: string | null;
  seat: Seat | null;
  role: "player" | "spectator";
  view: PlayerView | null;
  players: SeatPlayers | null;
  ranked: boolean | null;
  /** null = coin flip, a seat = who chose; undefined from an older server. */
  firstSeatPickedBy: Seat | null | undefined;
  /** The dice roll that decided this game's order (a room's first game, #1190), else null. */
  firstSeatDice: DiceResult | null;
  /** The opening dice roll in progress, before any game exists (#1190); null once the game starts or it is cancelled. */
  dice: DiceStateMessage | null;
  brief: BriefTicketWire | null;
  vsBot: boolean;
  battleLog: BattleLogEntry[];
  /** Board instance ids → cards, so log lines can name attackers / blockers. Never mutated in place. */
  instances: InstanceIndex;
  errorBanner: string | null;
  matchOver: MatchOverMessage["result"] | null;
  timer: TimerMessage | null;
  chat: ChatLine[];
  undo: UndoState | null;
  /** Per seat: epoch ms until which a dropped player may reconnect (else null). */
  awayUntil: [number | null, number | null];
  seatSkins: [SeatSkin | null, SeatSkin | null];
  rematch: RematchState | null;
};

export type WelcomeInfo = {
  matchId: string;
  seat: Seat;
  view: PlayerView;
  role: "player" | "spectator";
  players?: SeatPlayers;
  ranked?: boolean;
  firstSeatPickedBy?: Seat | null;
  dice?: DiceResult | null;
  brief?: BriefTicketWire;
};

export const SPECTATOR_CAP_MESSAGE = "This match already has the most spectators.";

/** Chat lines kept; history replays on every sync, so older ones only matter to scrollback. */
export const CHAT_KEEP = 100;

/**
 * What the board should do with a server error. `reset` ends the match locally (the owner also tears down its
 * socket / resume blob) and shows `text` back in the lobby.
 */
export type ErrorOutcome = { kind: "ignore" } | { kind: "banner"; text: string } | { kind: "reset"; text: string };

export function classifyServerError(
  err: Pick<ErrorMessage, "code" | "message">,
  state: Pick<MatchState, "view" | "mode">,
  connectRole: "player" | "spectator",
): ErrorOutcome {
  // Colyseus seat-reservation races are recovered via reconnect/mint; never pin them on the board banner.
  if (isSeatReservationExpiredError(err.message)) return { kind: "ignore" };
  // Practice has no lobby to fall back to and no spectators: every other error is a plain banner.
  if (state.mode === "hotseat") return { kind: "banner", text: `${err.code}: ${err.message}` };
  // A spectator who arrives before the first deal is not in trouble:
  // the board already says "Waiting for the match to start…".
  if (err.code === "match_not_ready" && !state.view) return { kind: "ignore" };
  if (err.code === "room_full" && connectRole === "spectator") return { kind: "reset", text: SPECTATOR_CAP_MESSAGE };
  // Ranked opponent never arrived and the room closed: back to the lobby with the reason
  // instead of "Waiting for opponent…" forever.
  if (err.code === "opponent_no_show") return { kind: "reset", text: err.message };
  return { kind: "banner", text: `${err.code}: ${err.message}` };
}

/** Everything the reducer accepts: the server messages the client handles, then local session transitions. */
export type MatchAction =
  // ---- server messages ----
  | { type: "welcome"; info: WelcomeInfo }
  | { type: "view"; view: PlayerView }
  /** `step`: intents the room had applied after these events. `turn` overrides the view's turn (demo only). */
  | { type: "events"; events: unknown[]; step?: number; turn?: number }
  | { type: "skin"; msg: SkinMessage }
  | { type: "error"; err: Pick<ErrorMessage, "code" | "message">; connectRole?: "player" | "spectator" }
  | { type: "staleIllegalIntent" }
  | { type: "matchOver"; result: MatchOverMessage["result"] }
  | { type: "timer"; msg: TimerMessage }
  | { type: "chat"; lines: ChatLine[] }
  | { type: "undoState"; state: UndoState }
  | { type: "presence"; awayUntil: [number | null, number | null] }
  | { type: "rematchState"; state: RematchState }
  | { type: "diceState"; state: DiceStateMessage }
  | { type: "undoApplied"; info: UndoApplied }
  | { type: "takenOver" }
  | { type: "disconnect" }
  | { type: "drop" }
  | { type: "reconnect" }
  | { type: "queued" }
  // ---- local transitions ----
  /** A new connect(): forget the last match's per-match data; the welcome fills it in again. */
  | { type: "connectStarted"; role: "player" | "spectator"; vsBot: boolean }
  | { type: "queueStarted" }
  | { type: "queueCancelled" }
  /** The client resolved a connect / queue / reconnect: set only the flags given. */
  | {
      type: "joined";
      matchId: string;
      seat: Seat;
      canReconnect: boolean;
      queueing?: false;
      reconnecting?: false;
      resuming?: false;
    }
  | { type: "reconnectStarted" }
  | { type: "reconnectFailed"; banner: string }
  | { type: "resumeStarted" }
  | { type: "resumeEnded"; banner?: string }
  /** startMatch: the board opens empty behind the request. */
  | { type: "launchStarted" }
  | { type: "launchFailed"; banner: string }
  /** Leave / abandoned connect: everything per-match goes (the banner and battle log stay). */
  | { type: "reset" }
  | { type: "setError"; message: string | null }
  | { type: "clearBattleLog" };

export function createInitialMatchState(mode: MatchMode = "online", overrides: Partial<MatchState> = {}): MatchState {
  return {
    mode,
    connected: false,
    takenOver: false,
    queueing: false,
    canReconnect: false,
    resuming: false,
    reconnecting: false,
    matchId: null,
    seat: null,
    role: "player",
    view: null,
    players: null,
    ranked: null,
    firstSeatPickedBy: undefined,
    firstSeatDice: null,
    dice: null,
    brief: null,
    vsBot: false,
    battleLog: [],
    instances: new Map(),
    errorBanner: null,
    matchOver: null,
    timer: null,
    chat: [],
    undo: null,
    awayUntil: [null, null],
    seatSkins: [null, null],
    rematch: null,
    ...overrides,
  };
}

function indexed(prev: InstanceIndex, view: PlayerView | null): InstanceIndex {
  const next: InstanceIndex = new Map(prev);
  indexViewInstances(view, next);
  return next;
}

/** Spectators follow a camera seat but are not "You". */
function youSeatOf(s: MatchState): Seat | null {
  return s.view?.spectator ? null : s.seat;
}

export function matchReducer(s: MatchState, a: MatchAction): MatchState {
  switch (a.type) {
    case "welcome": {
      const { info } = a;
      // A welcome starts (or resyncs) a game. Online / demo: always a clean slate, since a rematch clears the last
      // result and a resync of a finished game re-sends match_over after this. Practice reuses the room for a
      // rematch and only clears once the previous game was over; a mid-game resync keeps its log.
      const fresh = s.mode !== "hotseat" || s.matchOver != null;
      const base: MatchState = {
        ...s,
        players: info.players ?? null,
        firstSeatPickedBy: info.firstSeatPickedBy,
        firstSeatDice: info.dice ?? null,
        // The roll is over: the game it decided has begun.
        dice: null,
        ranked: typeof info.ranked === "boolean" ? info.ranked : null,
        brief: info.role === "player" ? (info.brief ?? null) : null,
        matchId: info.matchId,
        seat: info.seat,
        role: info.role,
        view: info.view,
        connected: true,
        reconnecting: false,
        canReconnect: info.role === "player",
        queueing: false,
        resuming: false,
      };
      if (!fresh) return { ...base, instances: indexed(s.instances, info.view) };
      return {
        ...base,
        instances: indexed(new Map(), info.view),
        battleLog: [],
        matchOver: null,
        rematch: null,
      };
    }
    case "view":
      return { ...s, view: a.view, instances: indexed(s.instances, a.view) };
    case "events": {
      const instances = indexed(s.instances, s.view);
      const lines = narrateEvents(a.events, {
        youSeat: youSeatOf(s),
        turnNumber: a.turn ?? s.view?.turnNumber ?? 1,
        instances,
      });
      if (!lines.length) return { ...s, instances };
      const stamped = a.step === undefined ? lines : lines.map((l) => ({ ...l, step: a.step }));
      return { ...s, instances, battleLog: [...s.battleLog, ...stamped] };
    }
    case "skin": {
      const seatSkins: [SeatSkin | null, SeatSkin | null] = [s.seatSkins[0], s.seatSkins[1]];
      seatSkins[a.msg.seat] = a.msg.skin;
      return { ...s, seatSkins };
    }
    case "error": {
      const out = classifyServerError(a.err, s, a.connectRole ?? s.role);
      if (out.kind === "ignore") return s;
      if (out.kind === "reset") return { ...resetMatchState(s), errorBanner: out.text };
      return { ...s, errorBanner: out.text };
    }
    case "staleIllegalIntent":
      // A late action's "Not your turn" must not linger into your next turn.
      return s.errorBanner?.startsWith("illegal_intent:") ? { ...s, errorBanner: null } : s;
    case "matchOver":
      return { ...s, matchOver: a.result, canReconnect: false };
    case "timer":
      return { ...s, timer: a.msg };
    case "chat": {
      // History replays on every sync; merge by id so nothing duplicates.
      const seen = new Set(s.chat.map((l) => l.id));
      const fresh = a.lines.filter((l) => !seen.has(l.id));
      return fresh.length ? { ...s, chat: [...s.chat, ...fresh].slice(-CHAT_KEEP) } : s;
    }
    case "undoState":
      return { ...s, undo: a.state };
    case "presence":
      return { ...s, awayUntil: a.awayUntil };
    case "rematchState":
      return { ...s, rematch: a.state };
    case "diceState":
      // A cancelled roll (a seat left) sends everyone back to waiting for an opponent.
      return { ...s, dice: a.state.step === "cancelled" ? null : a.state };
    case "undoApplied": {
      const { toTurn, toStep, by, action, scope } = a.info;
      return {
        ...s,
        battleLog: rewindBattleLog(s.battleLog, toTurn, by, youSeatOf(s), toStep, action?.label, scope === "turn"),
      };
    }
    case "takenOver":
      // The seat is theirs now: keep the last board on screen and stop every path that would reclaim it.
      return {
        ...s,
        takenOver: true,
        connected: false,
        reconnecting: false,
        canReconnect: false,
        queueing: false,
        resuming: false,
      };
    case "disconnect":
      return { ...s, connected: false, reconnecting: false, queueing: false };
    case "drop":
      return { ...s, connected: false, reconnecting: true };
    case "reconnect":
      return { ...s, connected: true, reconnecting: false };
    case "queued":
      return { ...s, queueing: true };

    case "connectStarted":
      return {
        ...s,
        errorBanner: null,
        takenOver: false,
        matchOver: null,
        timer: null,
        chat: [],
        undo: null,
        view: null,
        ranked: null,
        firstSeatPickedBy: undefined,
        firstSeatDice: null,
        dice: null,
        brief: null,
        vsBot: a.vsBot,
        queueing: false,
        resuming: false,
        role: a.role,
      };
    case "queueStarted":
      return {
        ...s,
        errorBanner: null,
        matchOver: null,
        timer: null,
        chat: [],
        undo: null,
        view: null,
        takenOver: false,
        queueing: true,
        resuming: false,
      };
    case "queueCancelled":
      return { ...s, queueing: false };
    case "joined":
      return {
        ...s,
        matchId: a.matchId,
        seat: a.seat,
        connected: true,
        canReconnect: a.canReconnect,
        ...(a.queueing === false ? { queueing: false } : null),
        ...(a.reconnecting === false ? { reconnecting: false } : null),
        ...(a.resuming === false ? { resuming: false } : null),
      };
    case "reconnectStarted":
      return { ...s, errorBanner: null, reconnecting: true };
    case "reconnectFailed":
      return { ...s, reconnecting: false, canReconnect: false, resuming: false, errorBanner: a.banner };
    case "resumeStarted":
      return { ...s, resuming: true, errorBanner: null };
    case "resumeEnded":
      if (!s.resuming && a.banner === undefined) return s;
      return { ...s, resuming: false, ...(a.banner !== undefined ? { errorBanner: a.banner } : null) };
    case "launchStarted":
      return { ...s, errorBanner: null, takenOver: false, view: null, matchId: null, seat: null };
    case "launchFailed":
      return { ...s, queueing: false, errorBanner: a.banner };
    case "reset":
      return resetMatchState(s);
    case "setError":
      return s.errorBanner === a.message ? s : { ...s, errorBanner: a.message };
    case "clearBattleLog":
      return s.battleLog.length ? { ...s, battleLog: [] } : s;
  }
}

function resetMatchState(s: MatchState): MatchState {
  return {
    ...s,
    seatSkins: [null, null],
    takenOver: false,
    awayUntil: [null, null],
    rematch: null,
    connected: false,
    reconnecting: false,
    queueing: false,
    canReconnect: false,
    resuming: false,
    matchId: null,
    seat: null,
    role: "player",
    view: null,
    players: null,
    ranked: null,
    firstSeatPickedBy: undefined,
    firstSeatDice: null,
    dice: null,
    brief: null,
    vsBot: false,
    matchOver: null,
    timer: null,
    chat: [],
    undo: null,
  };
}

export type MatchStore = {
  getSnapshot: () => MatchState;
  subscribe: (listener: () => void) => () => void;
  dispatch: (action: MatchAction) => void;
};

/** A store around `matchReducer`. Listeners run only when the state object actually changed. */
export function createMatchStore(mode: MatchMode = "online", overrides: Partial<MatchState> = {}): MatchStore {
  let state = createInitialMatchState(mode, overrides);
  const listeners = new Set<() => void>();
  return {
    getSnapshot: () => state,
    subscribe(listener) {
      listeners.add(listener);
      return () => void listeners.delete(listener);
    },
    dispatch(action) {
      const next = matchReducer(state, action);
      if (next === state) return;
      state = next;
      for (const l of [...listeners]) l();
    },
  };
}
