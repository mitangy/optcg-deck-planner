import {
  botTurnMemory,
  chooseBotIntentFromState,
  createSeededRng,
  listLegalIntents,
  noteBotPick,
  type BotLevel,
  type Intent,
  type MatchState,
  type Seat,
} from "@optcg/rules";
import { sharedBotPool } from "../../botPool.js";
import { assertKnownDeck } from "../../rankedDeck.js";
import type { BotRoomOptions } from "../../protocol.js";
import type { DuelCore } from "./context.js";
import type { TimerHandle } from "./time.js";

/** The seat a "Play vs Bot" room gives the server-side player (#631). */
export const BOT_SEAT: Seat = 1;
/** Account id of the bot seat: never positive, so a bot game is never written to match history. */
export const BOT_USER_ID = 0;
/**
 * How long the bot waits before each move so the human can follow it. Mutable so tests can shorten it:
 * `mainMs` for main-phase actions, `choiceMs` for choices, blocks, counters and mulligans.
 */
export const botPacing = { mainMs: 700, choiceMs: 400 };
/**
 * Hard bot: how a decision's lookahead is run (#631, #635).
 *  - `useWorker`: the search runs in a worker thread (botPool.ts), so a long lookahead never blocks the room's event loop.
 *    When the worker fails or times out, the bot plays a Normal move in the room's thread. With `false`, or when the pool
 *    is switched off (BOT_WORKERS=0), the search runs in the room's thread under `inThreadBudgetMs` (the pre-#635 behavior).
 *  - `budgetMs`, `samples`: wall-clock budget and determinized copies of one decision in the worker (the search is cheaper than the budget on most decisions). The search is anytime, so a smaller budget only makes the bot play more like Normal.
 *  - `timeoutMs`: how long a room waits for the worker (queue time included) before it plays Normal instead.
 */
export const botSearch = { useWorker: true, budgetMs: 1500, samples: 6, timeoutMs: 4000, inThreadBudgetMs: 200 };
/** Safety net: after this many bot intents in one turn the bot only ends the turn / passes. */
export const BOT_MAX_INTENTS_PER_TURN = 150;

export function botDisplayName(level: BotLevel): string {
  return `Bot (${level === "easy" ? "Easy" : level === "hard" ? "Hard" : "Normal"})`;
}

/** Plays seat 1 of a "Play vs Bot" room: paces its moves, searches (Hard, in a worker), and falls back when stuck. */
export class BotDriver {
  private botTimer: TimerHandle | null = null;
  /** Hard bot (#635): a search is running in the worker pool; the next bot step waits for it. */
  private botJob: { id: number; match: MatchState } | null = null;
  /** Hard bot only: decisions taken, how many were searched, and the time they took (logged when the game ends). */
  stats = { decisions: 0, searches: 0, ms: 0 };
  private botTurn = -1;
  private botIntentsThisTurn = 0;

  constructor(
    private readonly core: Pick<DuelCore, "game" | "io" | "time" | "undo" | "applySeatIntent" | "concedeSeat">,
  ) {}

  /** The bot's seat, or null in a room without one. */
  seat(): Seat | null {
    return this.core.game.bot ? BOT_SEAT : null;
  }

  /** Seat the server-side player: it fills seat 1, so the match starts as soon as the human sits down. */
  seatBot(opts: BotRoomOptions) {
    const { game } = this.core;
    assertKnownDeck(opts.deck);
    game.bot = { level: opts.level, rng: createSeededRng((game.seed ^ 0x5bd1e995) >>> 0) };
    if (opts.level === "hard" && botSearch.useWorker && sharedBotPool().enabled()) sharedBotPool().warm();
    game.seatDecks[BOT_SEAT] = opts.deck;
    game.seats[BOT_SEAT] = {
      seat: BOT_SEAT,
      sessionId: "bot",
      displayId: "bot",
      displayName: botDisplayName(opts.level),
      userId: BOT_USER_ID,
    };
  }

  /** Clear everything tied to one game so a rematch starts clean. */
  resetPerGameState() {
    this.clearTimer();
    this.botTurn = -1;
    this.botIntentsThisTurn = 0;
  }

  clearTimer() {
    this.botTimer?.clear();
    this.botTimer = null;
    // A search still running for a position that is gone is of no use: free its worker.
    const job = this.botJob;
    this.botJob = null;
    if (job) sharedBotPool().cancel(job.id);
  }

  /**
   * After a state change: if the bot can act, queue one move after a pacing delay. At most one
   * move is ever queued; the move itself re-reads the state, so a stale queue is harmless.
   */
  scheduleStep() {
    const { game } = this.core;
    if (!game.bot || this.botTimer || this.botJob || game.disposed) return;
    const m = game.match;
    if (!m || !game.matchStarted || game.matchOverSent || m.winner !== null || m.phase === "game_over") return;
    if (listLegalIntents(m, BOT_SEAT).length === 0) return;
    const quick = m.pendingChoices.length > 0 || m.phase !== "main";
    this.botTimer = this.core.time.setTimeout(() => {
      this.botTimer = null;
      this.runStep();
    }, quick ? botPacing.choiceMs : botPacing.mainMs);
  }

  private runStep() {
    const { game, io } = this.core;
    const bot = game.bot;
    const m = game.match;
    if (!bot || !m || !game.matchStarted || game.matchOverSent || m.winner !== null || m.phase === "game_over") return;
    const legal = listLegalIntents(m, BOT_SEAT);
    if (legal.length === 0) return;
    if (m.turnNumber !== this.botTurn) {
      this.botTurn = m.turnNumber;
      this.botIntentsThisTurn = 0;
    }
    this.botIntentsThisTurn += 1;
    const overCap = this.botIntentsThisTurn > BOT_MAX_INTENTS_PER_TURN;
    if (overCap && this.botIntentsThisTurn === BOT_MAX_INTENTS_PER_TURN + 1) {
      io.log("warn", "bot_turn_cap", { matchId: game.matchId, turn: m.turnNumber });
    }

    if (!overCap && bot.level === "hard" && botSearch.useWorker && sharedBotPool().enabled()) {
      this.runHardInWorker(m, legal);
      return;
    }

    let intent: Intent | null = null;
    if (!overCap) {
      try {
        const startedAt = performance.now();
        let searched = false;
        intent = chooseBotIntentFromState(m, BOT_SEAT, { level: bot.level, rng: bot.rng, budgetMs: botSearch.inThreadBudgetMs, onTrace: () => { searched = true; } });
        this.stats.decisions += 1;
        this.stats.ms += performance.now() - startedAt;
        if (searched) this.stats.searches += 1;
      } catch (e) {
        io.log("warn", "bot_error", { matchId: game.matchId, message: e instanceof Error ? e.message : String(e) });
      }
      if (!intent) io.log("warn", "bot_no_intent", { matchId: game.matchId, phase: m.phase });
    }
    this.playIntent(m, legal, intent);
  }

  /**
   * Hard bot (#635): search `m` in the worker pool and play the answer. The answer is dropped when the room moved on in the
   * meantime (a move, undo, rematch, concede or dispose replaces `game.match`), and a failed or late worker falls back to
   * a Normal move computed here, so the human never waits on a stuck bot.
   */
  private runHardInWorker(m: MatchState, legal: Intent[]) {
    const { game, io } = this.core;
    const bot = game.bot!;
    const pool = sharedBotPool();
    const startedAt = performance.now();
    const seed = bot.rng.nextInt(0x3fffffff);
    const memory = botTurnMemory(m, BOT_SEAT, bot.rng);
    const job: { id: number; match: MatchState } = { id: -1, match: m };
    this.botJob = job;
    pool.run({ state: m, seat: BOT_SEAT, seed, memory, budgetMs: botSearch.budgetMs, samples: botSearch.samples }, botSearch.timeoutMs, (id) => { job.id = id; }).then(
      (r) => ({ intent: r.intent, searched: r.searched, error: null as string | null }),
      (e: unknown) => ({ intent: null as Intent | null, searched: false, error: e instanceof Error ? e.message : String(e) }),
    ).then((r) => {
      if (this.botJob !== job) return; // cancelled: the room cleared the bot (dispose, game over, rematch)
      this.botJob = null;
      if (game.disposed || game.match !== m) {
        this.scheduleStep();
        return;
      }
      let intent = r.intent;
      if (r.error !== null) {
        io.log("warn", "bot_worker_failed", { matchId: game.matchId, message: r.error });
        try {
          intent = chooseBotIntentFromState(m, BOT_SEAT, { level: "normal", rng: bot.rng });
        } catch (e) {
          io.log("warn", "bot_error", { matchId: game.matchId, message: e instanceof Error ? e.message : String(e) });
        }
      } else {
        if (intent) noteBotPick(m, BOT_SEAT, bot.rng, intent);
        this.stats.decisions += 1;
        this.stats.ms += performance.now() - startedAt;
        if (r.searched) this.stats.searches += 1;
      }
      if (!intent) io.log("warn", "bot_no_intent", { matchId: game.matchId, phase: m.phase });
      this.playIntent(m, legal, intent);
    });
  }

  /** Play the bot's intent; if the room rejects it, pass, else any listed legal move, else give the game up. */
  private playIntent(m: MatchState, legal: Intent[], intent: Intent | null) {
    const { game, io } = this.core;
    if (intent) {
      const applied = this.core.applySeatIntent(BOT_SEAT, intent);
      if (applied.ok) return;
      io.log("warn", "bot_illegal_intent", { matchId: game.matchId, intent, message: applied.message });
    }
    // Never leave the human waiting on a stuck bot: pass, else any listed legal move
    // (a rejected prompt answer has no pass), else give the game up.
    const passes: Intent[] = legal.filter((i) => i.type === "end_turn" || i.type === "pass_block" || i.type === "pass_counter");
    for (const fallback of [...passes, ...legal.filter((i) => !passes.includes(i))]) {
      if (this.core.applySeatIntent(BOT_SEAT, fallback).ok) return;
    }
    io.log("warn", "bot_conceded", { matchId: game.matchId, phase: m.phase });
    this.core.concedeSeat(BOT_SEAT);
  }

  /** The bot always accepts the human's undo request, after a short pause. */
  answerUndo() {
    const { game, io, undo } = this.core;
    const req = undo.request;
    if (!game.bot || !req || req.from === BOT_SEAT) return;
    this.core.time.setTimeout(() => {
      const cur = undo.request;
      if (!cur || cur.id !== req.id || !game.match || game.match.winner !== null || game.matchOverSent) return;
      io.log("info", "bot_undo_accepted", { matchId: game.matchId, id: cur.id });
      undo.apply(cur.from, cur.scope);
    }, botPacing.choiceMs);
  }
}
