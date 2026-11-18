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

export const BOT_SEAT: Seat = 1;
/** Account id of the bot seat: never positive, so a bot game is never written to match history. */
export const BOT_USER_ID = 0;
export const botPacing = { mainMs: 700, choiceMs: 400 };
// The Hard bot's search runs in a worker so a long lookahead never blocks the room's event loop; a failed or late worker falls back to a Normal move.
export const botSearch = { useWorker: true, budgetMs: 1500, samples: 6, timeoutMs: 4000, inThreadBudgetMs: 200 };
/** Safety net: after this many bot intents in one turn the bot only ends the turn / passes. */
export const BOT_MAX_INTENTS_PER_TURN = 150;

export function botDisplayName(level: BotLevel): string {
  return `Bot (${level === "easy" ? "Easy" : level === "hard" ? "Hard" : "Normal"})`;
}

export class BotDriver {
  private botTimer: TimerHandle | null = null;
  private botJob: { id: number; match: MatchState } | null = null;
  stats = { decisions: 0, searches: 0, ms: 0 };
  private botTurn = -1;
  private botIntentsThisTurn = 0;

  constructor(
    private readonly core: Pick<DuelCore, "game" | "io" | "time" | "undo" | "seats" | "applySeatIntent" | "concedeSeat">,
  ) {}

  seat(): Seat | null {
    return this.core.game.bot ? BOT_SEAT : null;
  }

  /** Fills seat 1, so the match starts as soon as the human sits down. */
  seatBot(opts: BotRoomOptions) {
    const { game } = this.core;
    assertKnownDeck(opts.deck);
    game.bot = { level: opts.level, rng: createSeededRng((game.seed ^ 0x5bd1e995) >>> 0) };
    if (opts.level === "hard" && botSearch.useWorker && sharedBotPool().enabled()) sharedBotPool().warm();
    game.seatDecks[BOT_SEAT] = opts.deck;
    this.core.seats.occupy(BOT_SEAT, {
      sessionId: "bot",
      displayId: "bot",
      displayName: botDisplayName(opts.level),
      userId: BOT_USER_ID,
    });
  }

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

  // At most one move is queued; the move re-reads the state, so a stale queue is harmless.
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

  // The answer is dropped when the room moved on meanwhile; a failed or late worker falls back to a Normal move so the human never waits on a stuck bot.
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
