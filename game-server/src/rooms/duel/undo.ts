import type { Client } from "colyseus";
import { deserializeMatch, revealReason, serializeMatch, type GameEvent, type Intent, type MatchState, type Seat } from "@optcg/rules";
import { undoLabel } from "../../undoLabel.js";
import {
  parseUndoMessage,
  type UndoAction,
  type UndoAppliedMessage,
  type UndoOption,
  type UndoScope,
  type UndoStateMessage,
} from "../../protocol.js";
import type { DuelCore, WireBody } from "./context.js";

const UNDO_HISTORY_LIMIT = 40;

export type UndoSnapshot = {
  match: string;
  turnNumber: number;
  intentCount: number;
  seat: Seat;
  label: string;
  revealReason?: string;
};

export class UndoHistory {
  stack: UndoSnapshot[] = [];
  private undoTruncated = false;
  request: UndoStateMessage["pending"] = null;
  private undoRequestSeq = 0;
  private lastUndoStateKey = "";

  constructor(
    private readonly core: Pick<
      DuelCore,
      "game" | "io" | "clocks" | "bots" | "spectators" | "syncPublicState"
    >,
  ) {}

  resetPerGameState() {
    this.stack = [];
    this.undoTruncated = false;
    this.request = null;
    this.lastUndoStateKey = "";
  }

  captureSnapshot(seat: Seat, intent: Intent): UndoSnapshot | null {
    const { game } = this.core;
    const m = game.match;
    if (game.competitive || !m) return null;
    if (m.phase === "mulligan" || m.winner !== null) return null;
    return {
      match: serializeMatch(m),
      turnNumber: m.turnNumber,
      intentCount: game.replay?.intents.length ?? 0,
      seat,
      label: undoLabel(m, seat, intent),
    };
  }

  // A state change voids any open undo request: it named an action relative to the old state.
  recordStep(snap: UndoSnapshot | null, before: MatchState | null, events: GameEvent[]) {
    const after = this.core.game.match;
    if (this.core.game.competitive || !after) return;
    if (snap && before) {
      const reason = revealReason(before, after, events);
      this.stack.push(reason ? { ...snap, revealReason: reason } : snap);
      if (this.stack.length > UNDO_HISTORY_LIMIT) {
        this.stack.shift();
        this.undoTruncated = true;
      }
    }
    this.request = null;
    this.broadcastState();
  }

  private targetIndex(scope: UndoScope): number | null {
    const last = this.stack.length - 1;
    if (last < 0) return null;
    if (scope === "action") return last;
    const turn = this.stack[last]!.turnNumber;
    let start = last;
    while (start > 0 && this.stack[start - 1]!.turnNumber === turn) start -= 1;
    if (start === 0 && this.undoTruncated) return null;
    return start;
  }

  private option(scope: UndoScope): UndoOption {
    if (this.stack.length === 0) {
      return { available: false, steps: 0, blockedReason: "Nothing to undo yet", forceable: false };
    }
    const idx = this.targetIndex(scope);
    if (idx === null) {
      return { available: false, steps: 0, blockedReason: "Undo history limit reached", forceable: false };
    }
    const range = this.stack.slice(idx);
    const reveal = [...range].reverse().find((snap) => snap.revealReason)?.revealReason;
    if (reveal) {
      return {
        available: false,
        steps: range.length,
        blockedReason: `Undo stops here: ${reveal}`,
        forceable: true,
        revealReason: reveal,
      };
    }
    return { available: true, steps: range.length, forceable: false };
  }

  state(): WireBody<UndoStateMessage> {
    const { game } = this.core;
    const enabled = !game.competitive;
    const over = !game.match || game.match.winner !== null || game.matchOverSent;
    const top = enabled && !over ? (this.stack.at(-1) ?? null) : null;
    let options: UndoStateMessage["options"] = null;
    let blockedReason: string | null = null;
    if (!enabled) {
      blockedReason = "No undo in ranked or tournament games";
    } else if (!over) {
      options = { action: this.option("action"), turn: this.option("turn") };
      if (!options.action.available && !options.turn.available) {
        blockedReason = options.action.blockedReason ?? options.turn.blockedReason ?? "Nothing to undo yet";
      }
    }
    return {
      enabled,
      targetTurn: top ? top.turnNumber : null,
      action: top ? { seat: top.seat, label: top.label } : null,
      options,
      blockedReason,
      pending: over ? null : this.request,
    };
  }

  sendState(client: Client) {
    this.core.io.send(client, "undo_state", this.state());
  }

  broadcastState() {
    const state = this.state();
    const key = JSON.stringify(state);
    if (key === this.lastUndoStateKey) return;
    this.lastUndoStateKey = key;
    this.core.io.broadcast("undo_state", state);
  }

  handle(client: Client, seat: Seat, message: unknown) {
    const { game, io, bots } = this.core;
    let action: UndoAction;
    let scope: UndoScope;
    let force: boolean;
    let id: number | undefined;
    try {
      ({ action, scope, force, id } = parseUndoMessage(message));
    } catch (e) {
      io.sendParseError(client, e);
      return;
    }
    if (game.competitive) {
      io.sendError(client, "unauthorized", "Undo is only available in private matches");
      return;
    }
    if (!game.match || !game.matchStarted) {
      io.sendError(client, "match_not_ready", "Match not started");
      return;
    }
    if (game.match.winner !== null || game.matchOverSent) {
      io.sendError(client, "match_over", "Match is over");
      return;
    }

    const req = this.request;
    switch (action) {
      case "request": {
        const top = this.stack.at(-1);
        const idx = this.targetIndex(scope);
        const option = this.option(scope);
        if (!top || idx === null) {
          io.sendError(client, "illegal_intent", option.blockedReason ?? "Nothing to undo yet");
          return;
        }
        // A reveal in range blocks a plain request; force goes past it, and only it.
        if (!option.available && !(force && option.forceable)) {
          io.sendError(client, "illegal_intent", option.blockedReason ?? "Nothing to undo yet");
          return;
        }
        this.request = {
          id: (this.undoRequestSeq += 1),
          from: seat,
          toTurn: this.stack[idx]!.turnNumber,
          action: { seat: top.seat, label: top.label },
          scope,
          steps: option.steps,
          force: option.revealReason !== undefined,
          revealReason: option.revealReason ?? null,
        };
        io.log("info", "undo_requested", {
          matchId: game.matchId,
          seat,
          toTurn: this.request.toTurn,
          scope,
          force: this.request.force,
        });
        this.broadcastState();
        bots.answerUndo();
        return;
      }
      case "cancel":
      case "decline": {
        if (!req) return;
        if ((action === "cancel") !== (req.from === seat)) {
          io.sendError(client, "unauthorized", "Not your undo request to answer");
          return;
        }
        this.request = null;
        this.broadcastState();
        return;
      }
      case "accept": {
        if (!req) {
          io.sendError(client, "illegal_intent", "No undo request to accept");
          return;
        }
        if (req.from === seat) {
          io.sendError(client, "unauthorized", "The other player must accept the undo");
          return;
        }
        // An accept names the request it saw; the requester may have changed it since (#540).
        if (id !== undefined && id !== req.id) {
          io.sendError(client, "illegal_intent", "The undo request changed; review it again");
          this.sendState(client);
          return;
        }
        this.apply(req.from, req.scope);
        return;
      }
    }
  }

  apply(by: Seat, scope: UndoScope) {
    const { game, io, clocks, bots, spectators } = this.core;
    const idx = this.targetIndex(scope);
    const last = this.stack.at(-1);
    const snap = idx === null ? undefined : this.stack[idx];
    if (!snap || !last) {
      this.request = null;
      this.broadcastState();
      return;
    }
    const steps = this.stack.length - idx!;
    this.stack.length = idx!;
    game.match = deserializeMatch(snap.match);
    game.replay?.intents.splice(snap.intentCount);
    // match.rng and deck order come back with the snapshot, so drawing again gives the same cards. Nothing is recorded in the replay.
    this.request = null;
    io.log("info", "undo_applied", {
      matchId: game.matchId,
      by,
      toTurn: snap.turnNumber,
      label: last.label,
      scope,
      steps,
    });

    const applied: WireBody<UndoAppliedMessage> = {
      toTurn: snap.turnNumber,
      toStep: snap.intentCount,
      by,
      action: { seat: last.seat, label: last.label },
      scope,
      steps,
    };
    io.broadcast("undo_applied", applied);
    this.core.syncPublicState();
    spectators.broadcastViews([]);
    // A rewound turn gets a fresh turn clock; chess clocks keep their spent time.
    clocks.refreshTurnClock();
    clocks.updateSeatClock();
    clocks.ensureTimerLoop();
    clocks.broadcastTimer();
    this.broadcastState();
    bots.scheduleStep();
  }
}
