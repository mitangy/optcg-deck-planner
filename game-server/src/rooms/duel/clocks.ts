import { listLegalIntents, type Intent, type Seat } from "@optcg/rules";
import type { TimerMessage } from "../../protocol.js";
import type { DuelCore, WireBody } from "./context.js";
import type { TimerHandle } from "./time.js";

/** How often the tick loop checks the clocks. */
const TICK_MS = 250;

/**
 * The room's three clocks: a per-turn clock, a whole-match clock and a per-seat chess clock (time
 * bank, charged to whoever must act). Runs the 250ms tick loop and ends the game when one expires.
 * All time comes from the injected `time`, so tests can run it on a fake clock.
 */
export class MatchClocks {
  private turnSeconds: number | null = null;
  private matchSeconds: number | null = null;
  /** Chess clock: per-seat time banks (ms), charged to whoever must act. */
  private seatSeconds: number | null = null;
  private turnEndsAt: number | null = null;
  matchEndsAt: number | null = null;
  seatRemainingMs: [number, number] = [0, 0];
  clockSeat: Seat | null = null;
  private clockSince = 0;
  private timerInterval: TimerHandle | null = null;
  private lastTimerActiveSeat: Seat | null = null;

  constructor(
    private readonly core: Pick<
      DuelCore,
      "game" | "io" | "time" | "undo" | "bots" | "spectators" | "syncPublicState" | "maybeSendMatchOver" | "applySeatIntent"
    >,
  ) {}

  configure(timer: { turnSeconds: number | null; matchSeconds: number | null; seatSeconds: number | null }) {
    this.turnSeconds = timer.turnSeconds;
    this.matchSeconds = timer.matchSeconds;
    this.seatSeconds = timer.seatSeconds;
  }

  /** The configured limits, for the room_created log line. */
  get limits() {
    return { turnSeconds: this.turnSeconds, matchSeconds: this.matchSeconds, seatSeconds: this.seatSeconds };
  }

  /** Clear everything tied to one game so a rematch starts clean. */
  resetPerGameState() {
    this.turnEndsAt = null;
    this.matchEndsAt = null;
    this.lastTimerActiveSeat = null;
    this.clockSeat = null;
  }

  /** A new game's clocks: match deadline, fresh banks, the first turn's clock, the tick loop. */
  startGame() {
    this.armMatchClock();
    this.armSeatClocks();
    this.refreshTurnClock();
    this.updateSeatClock();
    this.ensureTimerLoop();
    this.broadcastTimer();
  }

  clearTimerLoop() {
    if (this.timerInterval) {
      this.timerInterval.clear();
      this.timerInterval = null;
    }
  }

  ensureTimerLoop() {
    if (this.timerInterval) return;
    if (this.turnSeconds == null && this.matchSeconds == null && this.seatSeconds == null) return;
    this.timerInterval = this.core.time.setInterval(() => this.tickTimers(), TICK_MS);
  }

  private armMatchClock() {
    if (this.matchSeconds == null) {
      this.matchEndsAt = null;
      return;
    }
    this.matchEndsAt = this.core.time.now() + this.matchSeconds * 1000;
  }

  refreshTurnClock() {
    const match = this.core.game.match;
    if (!match || this.turnSeconds == null) {
      this.turnEndsAt = null;
      this.lastTimerActiveSeat = match?.activeSeat ?? null;
      return;
    }
    this.turnEndsAt = this.core.time.now() + this.turnSeconds * 1000;
    this.lastTimerActiveSeat = match.activeSeat;
  }

  /** After a state change: a new active seat gets a fresh turn clock, the chess clock follows whoever must act. */
  onMatchAdvanced() {
    const match = this.core.game.match;
    if (!match) return;
    if (match.winner !== null) {
      this.clearTimerLoop();
      this.turnEndsAt = null;
      this.stopSeatClock();
      this.broadcastTimer();
      return;
    }
    if (this.lastTimerActiveSeat !== match.activeSeat) {
      this.refreshTurnClock();
    }
    this.updateSeatClock();
    this.ensureTimerLoop();
    this.broadcastTimer();
  }

  private armSeatClocks() {
    const ms = (this.seatSeconds ?? 0) * 1000;
    this.seatRemainingMs = [ms, ms];
    this.clockSeat = null;
  }

  /** Bill the running seat for time spent since the last charge. */
  private chargeSeatClock(now = this.core.time.now()) {
    if (this.clockSeat === null) return;
    const s = this.clockSeat;
    this.seatRemainingMs[s] = Math.max(0, this.seatRemainingMs[s] - (now - this.clockSince));
    this.clockSince = now;
  }

  /**
   * Point the chess clock at whoever must act now (none after the end). During the mulligan it
   * runs for the seat that still has to answer: the first player decides first, then the other.
   */
  updateSeatClock() {
    if (this.seatSeconds == null || !this.core.game.match) return;
    const now = this.core.time.now();
    this.chargeSeatClock(now);
    const next = this.core.game.match.winner !== null ? null : this.seatForClock();
    if (next !== this.clockSeat) {
      this.clockSeat = next;
      this.clockSince = now;
    }
  }

  private seatForClock(): Seat | null {
    const m = this.core.game.match;
    if (!m) return null;
    // A pending choice (e.g. an Imu leader's start-of-game Stage prompt) blocks every mulligan,
    // so its owner is the seat being waited on, whichever seat is first.
    if (m.pendingChoices[0]) return m.pendingChoices[0].seat;
    if (m.phase === "mulligan") {
      const first = m.activeSeat;
      const second = (1 - first) as Seat;
      if (!m.players[first].mulliganDone) return first;
      if (!m.players[second].mulliganDone) return second;
      return null;
    }
    const acting = this.actingSeatForTimer();
    // The bot has no time bank: its pacing is its only delay.
    return acting === this.core.bots.seat() ? null : acting;
  }

  stopSeatClock() {
    this.chargeSeatClock();
    this.clockSeat = null;
  }

  timerPayload(): WireBody<TimerMessage> {
    this.chargeSeatClock();
    const seatClocks = this.seatSeconds != null;
    return {
      turnSeconds: this.turnSeconds,
      matchSeconds: this.matchSeconds,
      turnEndsAt: this.turnEndsAt,
      matchEndsAt: this.matchEndsAt,
      activeSeat: this.core.game.match?.activeSeat ?? 0,
      seatSeconds: this.seatSeconds,
      seatRemainingMs: seatClocks ? ([...this.seatRemainingMs] as [number, number]) : null,
      clockSeat: seatClocks ? this.clockSeat : null,
      // Absolute deadline for the running clock (same convention as turnEndsAt).
      clockEndsAt:
        seatClocks && this.clockSeat !== null
          ? this.core.time.now() + this.seatRemainingMs[this.clockSeat]
          : null,
    };
  }

  broadcastTimer() {
    this.core.io.broadcast("timer", this.timerPayload());
  }

  private tickTimers() {
    const { game } = this.core;
    if (!game.match || game.match.winner !== null || game.matchOverSent) {
      this.clearTimerLoop();
      return;
    }
    const now = this.core.time.now();
    if (this.matchEndsAt != null && now >= this.matchEndsAt) {
      this.expireMatchClock();
      return;
    }
    if (this.clockSeat !== null) {
      this.chargeSeatClock(now);
      if (this.seatRemainingMs[this.clockSeat] <= 0) {
        this.expireSeatClock(this.clockSeat);
        return;
      }
    }
    if (this.turnEndsAt != null && now >= this.turnEndsAt) {
      this.expireTurnClock();
    }
  }

  /** A clock ran out: `winner` takes the game, whatever the seats were doing. */
  private endGameOnClock(winner: Seat, reason: string, event: string, loser: Seat) {
    const { game, io, undo, spectators } = this.core;
    game.endReason = reason;
    game.match = {
      ...game.match!,
      winner,
      winReason: "leader_battle_at_zero_life",
      phase: "game_over",
    };
    this.core.syncPublicState();
    spectators.broadcastViews([]);
    undo.request = null;
    undo.broadcastState();
    this.stopSeatClock();
    this.clearTimerLoop();
    this.broadcastTimer();
    io.log("info", event, { matchId: game.matchId, winner, loser });
    this.core.maybeSendMatchOver();
  }

  private expireMatchClock() {
    const { game } = this.core;
    if (!game.match || game.match.winner !== null) return;
    // The seat the game is waiting on loses: a pending choice's owner, the defender in a
    // block/counter step, or a seat that has not answered its mulligan. If neither seat has
    // answered its mulligan, the first player loses as before.
    const m = game.match;
    const bothMulliganing = m.phase === "mulligan" && !m.players[0].mulliganDone && !m.players[1].mulliganDone;
    const loser = bothMulliganing
      ? (m.pendingChoices[0]?.seat ?? m.activeSeat)
      : (this.actingSeatForTimer() ?? m.activeSeat);
    const winner = (1 - loser) as Seat;
    this.endGameOnClock(winner, "match_timeout", "match_timeout", loser);
  }

  /** A player's own time bank ran out: they lose. */
  private expireSeatClock(loser: Seat) {
    const { game } = this.core;
    if (!game.match || game.match.winner !== null) return;
    const winner = (1 - loser) as Seat;
    this.endGameOnClock(winner, "timeout", "seat_clock_timeout", loser);
  }

  /** The turn clock ran out: the seat that must act plays its automatic move (pass, keep, decline). */
  expireTurnClock() {
    const { game, io, bots } = this.core;
    if (!game.match || game.match.winner !== null) return;
    const seat = this.actingSeatForTimer();
    if (seat === null || seat === bots.seat()) {
      // Nobody to auto-act (the bot plays itself); refresh so we do not tight-loop.
      this.refreshTurnClock();
      this.broadcastTimer();
      return;
    }
    const intent = this.autoIntentForSeat(seat);
    if (!intent) {
      this.refreshTurnClock();
      this.broadcastTimer();
      return;
    }
    io.log("info", "turn_timeout", {
      matchId: game.matchId,
      seat,
      intentType: intent.type,
    });
    if (!this.core.applySeatIntent(seat, intent).ok) {
      this.refreshTurnClock();
      this.broadcastTimer();
    }
  }

  /** Seat that must act now (pending choice owner, or battle defender, or active). */
  private actingSeatForTimer(): Seat | null {
    const { match } = this.core.game;
    if (!match) return null;
    const front = match.pendingChoices[0];
    if (front) return front.seat;
    if (
      (match.phase === "block" || match.phase === "counter") &&
      match.battle
    ) {
      return (1 - match.battle.attackerSeat) as Seat;
    }
    if (match.phase === "mulligan") {
      const p0 = match.players[0];
      const p1 = match.players[1];
      if (!p0.mulliganDone) return 0;
      if (!p1.mulliganDone) return 1;
      return null;
    }
    return match.activeSeat;
  }

  private autoIntentForSeat(seat: Seat): Intent | null {
    const { match } = this.core.game;
    if (!match) return null;
    const legal = listLegalIntents(match, seat);
    const front = match.pendingChoices[0];
    if (front && front.seat === seat) {
      if (front.kind === "order_effects") {
        return legal.find((i) => i.type === "order_pending_effects") ?? null;
      }
      if (front.optional) {
        return { type: "resolve_pending_choice", accept: false };
      }
      // Mandatory structured prompts (On Play hand pick, etc.) cannot auto-resolve.
      const bareAccept = legal.find(
        (i) => i.type === "resolve_pending_choice" && i.accept,
      );
      if (!bareAccept) return null;
      return bareAccept;
    }
    if (match.phase === "mulligan") {
      return { type: "mulligan", doMulligan: false };
    }
    if (match.phase === "block") {
      return legal.find((i) => i.type === "pass_block") ?? null;
    }
    if (match.phase === "counter") {
      return legal.find((i) => i.type === "pass_counter") ?? null;
    }
    if (match.phase === "main") {
      return legal.find((i) => i.type === "end_turn") ?? null;
    }
    return null;
  }
}
