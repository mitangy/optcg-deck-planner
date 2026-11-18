import { seatLog, type Seat } from "@optcg/rules";
import {
  LatestOnlySender,
  type MatchProgressPayload,
  type MatchResultPayload,
  type SoloGamePayload,
} from "../../writeback.js";
import type { DuelCore } from "./context.js";
import { BOT_SEAT } from "./bots.js";

export class MatchPersistence {
  private progressTurn: number | null = null;
  private progress: LatestOnlySender<{ matchId: string; payload: MatchProgressPayload }>;

  constructor(
    private readonly core: Pick<
      DuelCore,
      "game" | "config" | "io" | "time" | "ingestSeats" | "persistMatchProgress" | "persistMatchResult" | "persistSoloGame"
    >,
  ) {
    this.progress = new LatestOnlySender(
      ({ matchId, payload }) => this.core.persistMatchProgress(matchId, payload),
      () => this.core.io.log("warn", "match_progress_failed", { matchId: this.core.game.matchId }),
    );
  }

  resetPerGameState() {
    this.progressTurn = null;
  }

  noteTurn() {
    const { match } = this.core.game;
    if (match && match.winner === null && match.turnNumber !== this.progressTurn) {
      this.progressTurn = match.turnNumber;
      void this.saveProgress();
    }
  }

  ingestSeats(): [number, number] | { skip: string } {
    const s0 = this.core.game.matchUserIds?.[0];
    const s1 = this.core.game.matchUserIds?.[1];
    if (s0 == null || s1 == null) return { skip: "missing_user_ids" };
    // Skip ingest for synthetic legacy negative ids unless both are real (>0).
    if (s0 <= 0 || s1 <= 0) return { skip: "legacy_dev_users" };
    // Results are only written to the outbox on a deployed server (or one with MATCH_OUTBOX_DATABASE_URL set).
    if (!this.core.config.outboxEnabled) return { skip: "local_outbox_disabled" };
    return [s0, s1];
  }

  private soloGamePayload(winner: Seat, reason: string): SoloGamePayload | null {
    const { game } = this.core;
    const ids = game.matchUserIds;
    if (!ids) return null;
    const practiceUid = ids[0] === ids[1] ? ids[0] : game.practiceOwnerUid;
    if (!game.bot && practiceUid == null) return null;
    const humanSeat: Seat = game.bot ? ((1 - BOT_SEAT) as Seat) : 0;
    const userId = game.bot ? ids[humanSeat] : practiceUid!;
    if (userId <= 0) return null;
    const turns = game.match?.turnNumber;
    return {
      game_id: game.gameKey(),
      user_id: userId,
      mode: game.bot ? "bot" : "practice",
      ...(game.bot ? { bot_level: game.bot.level, won: winner === humanSeat } : {}),
      leader_id: game.replay?.players[humanSeat].leaderId,
      opponent_leader_id: game.replay?.players[1 - humanSeat].leaderId,
      turns,
      reason,
      // Bot games keep their replay; practice keeps nothing.
      ...(game.bot && game.replay ? { replay: { ...game.replay, intents: [...game.replay.intents], end: { winner, reason } } } : {}),
    };
  }

  /** match_over never waits on the API, and a few quick retries are all a stats row is worth. */
  private reportSoloGame(payload: SoloGamePayload): Promise<void> {
    const { game, io, time } = this.core;
    if (!this.core.config.outboxEnabled) {
      io.log("info", "solo_game_skip", { matchId: game.matchId, reason: "local_outbox_disabled" });
      return Promise.resolve();
    }
    return (async () => {
      for (let attempt = 1; attempt <= 3; attempt++) {
        try {
          await this.core.persistSoloGame(payload);
          return;
        } catch {
          if (attempt === 3) io.log("warn", "solo_game_report_failed", { matchId: game.matchId });
          else await time.sleep(500 * attempt);
        }
      }
    })();
  }

  async writebackResult(winner: Seat, reason: string) {
    const { game, io, time } = this.core;
    const solo = this.soloGamePayload(winner, reason);
    if (solo) {
      void this.reportSoloGame(solo);
      return;
    }
    const seats = this.core.ingestSeats();
    if (!Array.isArray(seats)) {
      io.log(seats.skip === "legacy_dev_users" ? "info" : "warn", "match_ingest_skip", {
        matchId: game.matchId,
        reason: seats.skip,
      });
      return;
    }
    const [s0, s1] = seats;
    const payload = this.resultPayload(s0, s1, winner, reason);
    // Keep the immutable payload and room alive across transient database outages.
    // A process crash before the first commit remains outside this outbox guarantee.
    for (;;) {
      try {
        await this.core.persistMatchResult(payload);
        return;
      } catch {
        io.log("warn", "match_enqueue_failed", { matchId: game.matchId });
        await time.sleep(1000);
      }
    }
  }

  // Opponent hands are revealed only for a game that can no longer be played (the room closing), which is then marked `closed`.
  saveProgress(reveal = false): Promise<void> {
    const seats = this.core.ingestSeats();
    if (!Array.isArray(seats) || !this.core.game.replay) return Promise.resolve();
    return this.progress.push({ matchId: this.core.game.gameKey(), payload: { ...this.progressPayload(seats[0], seats[1], reveal), ...(reveal ? { closed: true } : {}) } });
  }

  private progressPayload(s0: number, s1: number, reveal: boolean): MatchProgressPayload {
    const { game } = this.core;
    return {
      seat0_user_id: s0,
      seat1_user_id: s1,
      ranked: game.ranked,
      tournament: game.tournament,
      seat0_leader_id: game.replay?.players[0].leaderId,
      seat1_leader_id: game.replay?.players[1].leaderId,
      turns: game.match?.turnNumber,
      replay: game.replay ? { ...game.replay, intents: [...game.replay.intents] } : undefined,
      seat_logs: this.seatLogs(reveal),
    };
  }

  resultPayload(s0: number, s1: number, winner: Seat, reason: string): MatchResultPayload {
    const { game } = this.core;
    return {
      ...this.progressPayload(s0, s1, true),
      match_id: game.gameKey(),
      winner_seat: winner,
      reason,
      replay: game.replay ? { ...game.replay, intents: [...game.replay.intents], end: { winner, reason } } : undefined,
    };
  }

  // The opponent's hidden cards stay hidden unless `reveal`.
  private seatLogs(reveal: boolean): MatchResultPayload["seat_logs"] {
    const { game, io } = this.core;
    if (!game.replay) return undefined;
    try {
      return [seatLog(game.replay, 0, { revealOpponent: reveal }), seatLog(game.replay, 1, { revealOpponent: reveal })];
    } catch {
      io.log("warn", "seat_log_failed", { matchId: game.matchId });
      return undefined;
    }
  }
}
