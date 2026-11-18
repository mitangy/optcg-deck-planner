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

import { SERVER_RESTART_ENDED } from "./serverRestart";

export type MatchMode = "online" | "hotseat" | "demo";

export type MatchState = {
  mode: MatchMode;
  connected: boolean;
  takenOver: boolean;
  /** The server told this game it is about to restart. */
  serverRestart: { seconds: number } | null;
  queueing: boolean;
  canReconnect: boolean;
  resuming: boolean;
  reconnecting: boolean;
  matchId: string | null;
  seat: Seat | null;
  role: "player" | "spectator";
  view: PlayerView | null;
  players: SeatPlayers | null;
  ranked: boolean | null;
  firstSeatPickedBy: Seat | null | undefined;
  firstSeatDice: DiceResult | null;
  dice: DiceStateMessage | null;
  brief: BriefTicketWire | null;
  vsBot: boolean;
  battleLog: BattleLogEntry[];
  instances: InstanceIndex;
  errorBanner: string | null;
  matchOver: MatchOverMessage["result"] | null;
  timer: TimerMessage | null;
  chat: ChatLine[];
  undo: UndoState | null;
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

export const CHAT_KEEP = 100;

export type ErrorOutcome = { kind: "ignore" } | { kind: "banner"; text: string } | { kind: "reset"; text: string };

export function classifyServerError(
  err: Pick<ErrorMessage, "code" | "message">,
  state: Pick<MatchState, "view" | "mode">,
  connectRole: "player" | "spectator",
): ErrorOutcome {
  if (isSeatReservationExpiredError(err.message)) return { kind: "ignore" };
  // The server already resent the view, so a stale intent needs no banner.
  if (err.code === "stale_intent") return { kind: "ignore" };
  if (state.mode === "hotseat") return { kind: "banner", text: `${err.code}: ${err.message}` };
  if (err.code === "match_not_ready" && !state.view) return { kind: "ignore" };
  if (err.code === "room_full" && connectRole === "spectator") return { kind: "reset", text: SPECTATOR_CAP_MESSAGE };
  // Ranked opponent never arrived and the room closed: back to the lobby with the reason
  // instead of "Waiting for opponent…" forever.
  if (err.code === "opponent_no_show") return { kind: "reset", text: err.message };
  return { kind: "banner", text: `${err.code}: ${err.message}` };
}

export type MatchAction =
  | { type: "welcome"; info: WelcomeInfo }
  | { type: "view"; view: PlayerView }
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
  | { type: "serverRestarting"; seconds: number }
  | { type: "disconnect" }
  | { type: "drop" }
  | { type: "reconnect" }
  | { type: "queued" }
  | { type: "connectStarted"; role: "player" | "spectator"; vsBot: boolean }
  | { type: "queueStarted" }
  | { type: "queueCancelled" }
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
  | { type: "launchStarted" }
  | { type: "launchFailed"; banner: string }
  | { type: "reset" }
  | { type: "setError"; message: string | null }
  | { type: "clearBattleLog" };

export function createInitialMatchState(mode: MatchMode = "online", overrides: Partial<MatchState> = {}): MatchState {
  return {
    mode,
    connected: false,
    takenOver: false,
    serverRestart: null,
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
        dice: null,
        ranked: typeof info.ranked === "boolean" ? info.ranked : null,
        brief: info.role === "player" ? (info.brief ?? null) : null,
        matchId: info.matchId,
        seat: info.seat,
        role: info.role,
        view: info.view,
        connected: true,
        reconnecting: false,
        serverRestart: null,
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
      return s.errorBanner?.startsWith("illegal_intent:") ? { ...s, errorBanner: null } : s;
    case "matchOver":
      return { ...s, matchOver: a.result, canReconnect: false };
    case "timer":
      return { ...s, timer: a.msg };
    case "chat": {
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
      return { ...s, dice: a.state.step === "cancelled" ? null : a.state };
    case "undoApplied": {
      const { toTurn, toStep, by, action, scope } = a.info;
      return {
        ...s,
        battleLog: rewindBattleLog(s.battleLog, toTurn, by, youSeatOf(s), toStep, action?.label, scope === "turn"),
      };
    }
    case "takenOver":
      return {
        ...s,
        takenOver: true,
        connected: false,
        reconnecting: false,
        canReconnect: false,
        queueing: false,
        resuming: false,
      };
    case "serverRestarting":
      return s.matchOver || !s.view ? s : { ...s, serverRestart: { seconds: a.seconds } };
    case "disconnect":
      return s.serverRestart ? gameCutOffByRestart(s) : { ...s, connected: false, reconnecting: false, queueing: false };
    case "drop":
      return s.serverRestart ? gameCutOffByRestart(s) : { ...s, connected: false, reconnecting: true };
    case "reconnect":
      return { ...s, connected: true, reconnecting: false };
    case "queued":
      return { ...s, queueing: true };

    case "connectStarted":
      return {
        ...s,
        errorBanner: null,
        takenOver: false,
        serverRestart: null,
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
        serverRestart: null,
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
      return { ...s, errorBanner: null, takenOver: false, serverRestart: null, view: null, matchId: null, seat: null };
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

// The game is gone and there is nothing to reconnect to: leave the board so the lobby redirect shows why.
function gameCutOffByRestart(s: MatchState): MatchState {
  return {
    ...s,
    view: null,
    matchId: null,
    seat: null,
    connected: false,
    reconnecting: false,
    canReconnect: false,
    queueing: false,
    resuming: false,
    errorBanner: SERVER_RESTART_ENDED,
  };
}

function resetMatchState(s: MatchState): MatchState {
  return {
    ...s,
    seatSkins: [null, null],
    takenOver: false,
    serverRestart: null,
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
