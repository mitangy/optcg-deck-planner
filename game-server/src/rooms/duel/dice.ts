import { randomInt } from "node:crypto";
import type { Client } from "colyseus";
import { createSeededRng, type Rng, type Seat } from "@optcg/rules";
import {
  DICE_STEP_SECONDS,
  parseDiceMessage,
  type DiceAction,
  type DiceCall,
  type DiceStateMessage,
  type DiceStep,
  type ErrorCode,
} from "../../protocol.js";
import { BOT_SEAT, botPacing } from "./bots.js";
import type { DuelCore, WireBody } from "./context.js";
import type { TimerHandle } from "./time.js";

/** How long the bot lets a roll sit on screen before it picks first (the clients tumble the die meanwhile). */
export const DICE_REVEAL_MS = 1500;

/** The caller wins on High (4-6) with a 4, 5 or 6 and on Low (1-3) with a 1, 2 or 3. */
export function rollMatchesCall(call: DiceCall, roll: number): boolean {
  return call === "high" ? roll >= 4 : roll <= 3;
}

type Phase = {
  roller: Seat;
  caller: Seat;
  step: DiceStep;
  call: DiceCall | null;
  roll: number | null;
  winner: Seat | null;
  deadline: number | null;
};

/**
 * The opening dice roll of a room's first game (#1190): the server picks a roller, the other seat calls High or Low,
 * the roller rolls a d6, and whoever the roll favors picks first or second. A step nobody answers in
 * DICE_STEP_SECONDS is answered by the server for that seat. Rematches never roll (the loser chooses, see Rematch).
 */
export class FirstSeatDice {
  private phase: Phase | null = null;
  private stepTimer: TimerHandle | null = null;
  private botTimer: TimerHandle | null = null;
  private rng: Rng | null = null;

  constructor(
    private readonly core: Pick<DuelCore, "game" | "config" | "io" | "time" | "seats" | "spectators" | "sync" | "startMatch">,
  ) {}

  /** Test seam: tests replace this to script the roller, the bot's call and the roll. */
  randomInt(maxExclusive: number): number {
    // Deployed servers draw from the CSPRNG; local ones and tests from the room's seed so a game repeats.
    if (this.core.config.requireGameToken) return randomInt(maxExclusive);
    this.rng ??= createSeededRng((this.core.game.seed ^ 0xd1ce5eed) >>> 0);
    return this.rng.nextInt(maxExclusive);
  }

  /** A dice phase is running (a new seat cannot join; a ranked no-show timer must not close the room). */
  get active(): boolean {
    return this.phase !== null;
  }

  /** A room rolls for its first game's turn order when it asked to (or is deployed), unless it is a practice game (one account on both seats). */
  private enabled(): boolean {
    const { config, seats } = this.core;
    if (!config.diceRoll) return false;
    const [owner0, owner1] = seats.owners();
    return !(owner0 != null && owner0 === owner1);
  }

  /** Both seats are filled: start the roll. False when this room flips a coin instead (the caller starts the match). */
  begin(): boolean {
    if (this.phase) return true;
    if (!this.enabled()) return false;
    const roller = this.randomInt(2) as Seat;
    this.phase = {
      roller,
      caller: (1 - roller) as Seat,
      step: "call",
      call: null,
      roll: null,
      winner: null,
      deadline: null,
    };
    this.core.io.log("info", "dice_start", { matchId: this.core.game.matchId, roller });
    this.advance("call");
    return true;
  }

  /** The seat whose move the current step waits on. */
  private actor(p: Phase): Seat | null {
    switch (p.step) {
      case "call":
        return p.caller;
      case "roll":
        return p.roller;
      case "choose":
        return p.winner;
      default:
        return null;
    }
  }

  /** Enter `step`: restart its time limit, tell everyone, and let the bot act if it is the bot's move. */
  private advance(step: "call" | "roll" | "choose") {
    const p = this.phase!;
    const { time } = this.core;
    p.step = step;
    p.deadline = time.now() + DICE_STEP_SECONDS * 1000;
    this.clearTimers();
    this.stepTimer = time.setTimeout(() => this.timeOut(step), DICE_STEP_SECONDS * 1000);
    this.broadcast();
    if (this.core.game.bot && this.actor(p) === BOT_SEAT) {
      const wait = step === "choose" ? botPacing.choiceMs + DICE_REVEAL_MS : botPacing.choiceMs;
      this.botTimer = time.setTimeout(() => this.act(BOT_SEAT, this.defaultAction(step), step), wait);
    }
  }

  /** What the server plays for a seat that is a bot or ran out of time. */
  private defaultAction(step: "call" | "roll" | "choose"): DiceAction {
    if (step === "call") return { action: "call", call: this.randomInt(2) === 0 ? "high" : "low" };
    return step === "roll" ? { action: "roll" } : { action: "first" };
  }

  private timeOut(step: "call" | "roll" | "choose") {
    const p = this.phase;
    if (!p || p.step !== step) return;
    const seat = this.actor(p)!;
    this.core.io.log("info", "dice_timeout", { matchId: this.core.game.matchId, step, seat });
    this.act(seat, this.defaultAction(step), step);
  }

  private act(seat: Seat, action: DiceAction, onlyInStep: DiceStep) {
    if (this.phase?.step !== onlyInStep) return;
    this.apply(seat, action);
  }

  /** A client's `dice` message. */
  handle(client: Client, seat: Seat, message: unknown) {
    const { io } = this.core;
    let action: DiceAction;
    try {
      action = parseDiceMessage(message);
    } catch (e) {
      io.sendParseError(client, e);
      return;
    }
    const problem = this.apply(seat, action);
    if (problem) io.sendError(client, problem.code, problem.message);
  }

  /** Play `action` for `seat`; the refusal when it is not that seat's move. */
  private apply(seat: Seat, action: DiceAction): { code: ErrorCode; message: string } | null {
    const p = this.phase;
    if (!p) return { code: "match_not_ready", message: "There is no dice roll right now" };
    const wanted: DiceStep = action.action === "call" ? "call" : action.action === "roll" ? "roll" : "choose";
    if (p.step !== wanted) return { code: "match_not_ready", message: "That isn't the current dice step" };
    if (this.actor(p) !== seat) return { code: "unauthorized", message: "It isn't your turn at the dice" };
    switch (action.action) {
      case "call":
        p.call = action.call;
        this.advance("roll");
        return null;
      case "roll": {
        const roll = this.randomInt(6) + 1;
        p.roll = roll;
        p.winner = rollMatchesCall(p.call!, roll) ? p.caller : p.roller;
        this.core.io.log("info", "dice_roll", { matchId: this.core.game.matchId, call: p.call, roll, winner: p.winner });
        this.advance("choose");
        return null;
      }
      case "first":
      case "second":
        this.finish(action.action);
        return null;
    }
  }

  /** The winner picked: start the game with them as the chooser. */
  private finish(pick: "first" | "second") {
    const { game, io } = this.core;
    const p = this.phase!;
    const winner = p.winner!;
    const firstSeat: Seat = pick === "first" ? winner : ((1 - winner) as Seat);
    p.step = "done";
    p.deadline = null;
    this.clearTimers();
    this.broadcast();
    this.phase = null;
    game.dice = { roller: p.roller, caller: p.caller, call: p.call!, roll: p.roll!, winner };
    io.log("info", "dice_done", { matchId: game.matchId, winner, firstSeat });
    this.core.startMatch(firstSeat, winner);
  }

  /**
   * A seat left by consent while the roll ran. Both leaders are already revealed, so the leaver does not get a free
   * exit: the roll ends with the seat that stayed going first and the match starts, for the caller to forfeit the
   * leaver's seat (a loss, like leaving a live match). False when there is no roll.
   */
  abandon(stayer: Seat): boolean {
    const p = this.phase;
    if (!p) return false;
    const { game, io } = this.core;
    this.clearTimers();
    p.step = "done";
    p.deadline = null;
    this.broadcast();
    this.phase = null;
    io.log("info", "dice_abandoned", { matchId: game.matchId, stayer });
    this.core.startMatch(stayer, null);
    return true;
  }

  /** A seat left for good: stop the roll and send the clients back to waiting for an opponent. */
  cancel() {
    const p = this.phase;
    if (!p) return;
    this.core.io.log("info", "dice_cancelled", { matchId: this.core.game.matchId, step: p.step });
    this.clearTimers();
    p.step = "cancelled";
    p.deadline = null;
    this.broadcast();
    this.phase = null;
  }

  /** Room disposal. */
  clearTimers() {
    this.stepTimer?.clear();
    this.stepTimer = null;
    this.botTimer?.clear();
    this.botTimer = null;
  }

  /** The state as `seat` / `role` sees it (the names come along: there is no welcome yet). */
  private body(p: Phase, seat: Seat, role: "player" | "spectator"): WireBody<DiceStateMessage> {
    return {
      roller: p.roller,
      caller: p.caller,
      step: p.step,
      call: p.call,
      roll: p.roll,
      winner: p.winner,
      deadline: p.deadline,
      seat,
      role,
      players: this.core.sync.playersInfo(),
    };
  }

  /** Send one client the current state. False when no dice phase is running. */
  sendState(client: Client): boolean {
    const p = this.phase;
    if (!p) return false;
    const { io, seats, spectators } = this.core;
    const spec = spectators.forClient(client);
    if (spec) {
      io.send(client, "dice_state", this.body(p, spec.cameraSeat, "spectator"));
      return true;
    }
    const seat = seats.seatForClient(client);
    if (seat === null) return false;
    io.send(client, "dice_state", this.body(p, seat, "player"));
    return true;
  }

  private broadcast() {
    const p = this.phase;
    if (!p) return;
    const { io, seats, spectators } = this.core;
    for (const slot of seats.all()) {
      const client = slot ? io.clientFor(slot.sessionId) : undefined;
      if (slot && client) io.send(client, "dice_state", this.body(p, slot.seat, "player"));
    }
    for (const spec of spectators.list) {
      const client = io.clientFor(spec.sessionId);
      if (client) io.send(client, "dice_state", this.body(p, spec.cameraSeat, "spectator"));
    }
  }
}
