/**
 * Self-play recorder (#631): bot vs bot through the real engine, saved as MatchReplays.
 *
 * Usage: npx tsx src/sim/selfPlay.ts --games 100 --seed 1 [--decks decks.json] [--levels normal,normal] [--budget-ms 200] [--samples 3] [--horizon 1|2] [--max-evals N] [--paired] [--out dir]
 * decks.json = [{ "name", "leaderId", "deck": [50 ids] }]; without it every game gets two random decks.
 */
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { REGISTRY_HASH } from "../cards/abilities.js";
import { actingSeat, chooseBotIntentFromState, type BotLevel, type BotOptions } from "../bot/index.js";
import { getCardDef } from "../cards/definitions.js";
import { applyIntent, createMatch, listLegalIntents } from "../engine.js";
import type { MatchReplay } from "../matchReplay.js";
import { createSeededRng } from "../rng.js";
import { RULES_VERSION } from "../state/snapshot.js";
import type { GameEvent, Intent, MatchState, PlayerDeckConfig, Seat } from "../types.js";
import { randomDeck } from "./fuzz.js";

/** Counts of the advanced lines a bot played, per level (#631): the evidence that card effects are really used. */
export interface LineTally {
  /** Activate: Main intents, and how many of them came from the Leader. */
  activations: number;
  leaderActivations: number;
  activationsByCard: Record<string, number>;
  /** Optional ("You may ...") effect prompts answered yes / no, by the card that asked. */
  optionalAccepts: Record<string, number>;
  optionalDeclines: Record<string, number>;
  /** Counter Events played in the counter step, by card. */
  counterEvents: Record<string, number>;
  /** Characters that entered play other than by the hand's play_card (effects, [Trigger]s), by "card via source". */
  cheatOuts: Record<string, number>;
  /** Events played from hand with their [Main] effect, by card. */
  mainEvents: Record<string, number>;
  /** Intents the bot sent and time it spent choosing them. */
  decisions: number;
  decisionMs: number;
}

export const emptyTally = (): LineTally => ({ activations: 0, leaderActivations: 0, activationsByCard: {}, optionalAccepts: {}, optionalDeclines: {}, counterEvents: {}, cheatOuts: {}, mainEvents: {}, decisions: 0, decisionMs: 0 });
const bump = (m: Record<string, number>, k: string, n = 1): void => { m[k] = (m[k] ?? 0) + n; };

export function mergeTally(into: LineTally, from: LineTally): void {
  into.activations += from.activations;
  into.leaderActivations += from.leaderActivations;
  into.decisions += from.decisions;
  into.decisionMs += from.decisionMs;
  for (const key of ["activationsByCard", "optionalAccepts", "optionalDeclines", "counterEvents", "cheatOuts", "mainEvents"] as const) for (const [k, n] of Object.entries(from[key])) bump(into[key], k, n);
}

/** Update `tally` for one accepted intent: `before` is the state it was applied to, `events` what it caused. */
export function tallyIntent(tally: LineTally, before: MatchState, seat: Seat, intent: Intent, events: readonly GameEvent[], lastActivated: string[]): void {
  const p = before.players[seat];
  if (intent.type === "activate_ability") {
    tally.activations += 1;
    const source = [p.leader, ...p.characters, ...(p.stage ? [p.stage] : [])].find((c) => c.id === intent.sourceId);
    if (source) bump(tally.activationsByCard, source.defId);
    if (intent.sourceId === p.leader.id) tally.leaderActivations += 1;
  } else if (intent.type === "counter_event") {
    const card = p.hand[intent.handIndex];
    if (card) bump(tally.counterEvents, card.defId);
  } else if (intent.type === "play_card") {
    const card = p.hand[intent.handIndex];
    if (card && getCardDef(card.defId).type === "event") bump(tally.mainEvents, card.defId);
  } else if (intent.type === "resolve_pending_choice") {
    const front = before.pendingChoices[0];
    if (front && front.kind === "effect" && front.optional && (!front.request || front.request.type === "confirm")) bump(intent.accept ? tally.optionalAccepts : tally.optionalDeclines, front.cardDefId);
  }
  const handCardId = intent.type === "play_card" ? p.hand[intent.handIndex]?.id : undefined;
  for (const e of events) {
    if (e.type === "ability_activated" && e.seat === seat) lastActivated[0] = e.defId;
    if (e.type === "card_played" && getCardDef(e.defId).type === "character" && e.instanceId !== handCardId) bump(tally.cheatOuts, `${e.defId} via ${lastActivated[0] ?? "rules"}`);
  }
}

export type Chooser = (state: MatchState, seat: Seat, opts: BotOptions) => Intent | null;

export interface BotGameConfig {
  seed: number;
  players: [PlayerDeckConfig, PlayerDeckConfig];
  levels: [BotLevel, BotLevel];
  /** Hard bots: time budget per decision in ms (default 200), determinized samples (default 3) and horizon in turns (1 or 2). */
  budgetMs?: number;
  samples?: number;
  horizonTurns?: 1 | 2;
  /** Hard bots: stop each search after this many candidate evaluations (with `budgetMs: Infinity`, independent of the clock). */
  maxEvals?: number;
  /** Per-seat bot options on top of the ones above (#635): evalMode, prior, opponentModel, mulligan ... */
  seatOpts?: [Partial<BotOptions> | undefined, Partial<BotOptions> | undefined];
  /** Same for both seats (the seat's own `seatOpts` win). */
  allOpts?: Partial<BotOptions>;
  /** Replace the bot of a seat by any function of the state (an older version of the bot, for comparison). */
  chooser?: [Chooser | undefined, Chooser | undefined];
  /** Called when a bot's own answer was rejected by the engine (the engine default is played instead). */
  onRejected?: (info: { state: MatchState; seat: Seat; intent: Intent; message: string }) => void;
  /** Defaults to a seat derived from the seed. */
  firstSeat?: Seat;
  /** Safety cap on accepted intents (default 3000). */
  maxIntents?: number;
}

export interface BotGameResult {
  replay: MatchReplay;
  winner: Seat | null;
  turns: number;
  intents: number;
  /** Why the game did not finish: "max_intents", "no_legal_intents", or "engine_error: ...". */
  stoppedEarly?: string;
  /** Times a bot's own answer to a pending choice was rejected and the engine default was used instead. */
  fallbacks: number;
  /** Advanced lines played, by seat (index 0 / 1). */
  lines: [LineTally, LineTally];
}

const mix = (a: number, b: number): number => (Math.imul(a ^ 0x9e3779b9, 0x85ebca6b) ^ Math.imul(b + 0x7f4a7c15, 0xc2b2ae35)) >>> 0;

export function playBotGame(config: BotGameConfig): BotGameResult {
  const { seed, players, levels } = config;
  const maxIntents = config.maxIntents ?? 3000;
  const firstSeat: Seat = config.firstSeat ?? ((mix(seed, 1) & 1) as Seat);
  // One rng for the engine (the match's own), and one per bot so a bot's choices never shift the dice.
  const engineRng = createSeededRng(seed);
  const botRng = [createSeededRng(mix(seed, 2)), createSeededRng(mix(seed, 3))];
  const replay: MatchReplay = {
    schema: 1,
    rulesVersion: RULES_VERSION,
    registryHash: REGISTRY_HASH,
    seed,
    firstSeat,
    skipMulligans: false,
    players: [{ leaderId: players[0].leaderId, deck: [...players[0].deck] }, { leaderId: players[1].leaderId, deck: [...players[1].deck] }],
    lifeCheckEveryHit: true,
    privateChoicesV2: true,
    intents: [],
  };
  let state = createMatch({ seed, firstSeat, lifeCheckEveryHit: true, privateChoicesV2: true, players: [{ ...players[0], deck: [...players[0].deck] }, { ...players[1], deck: [...players[1].deck] }] });
  let stoppedEarly: string | undefined;
  let fallbacks = 0;
  const lines: [LineTally, LineTally] = [emptyTally(), emptyTally()];
  const lastActivated: [string[], string[]] = [[], []];
  try {
    while (state.winner === null) {
      if (replay.intents.length >= maxIntents) { stoppedEarly = "max_intents"; break; }
      const seat = actingSeat(state);
      const startedAt = performance.now();
      const choose = config.chooser?.[seat] ?? chooseBotIntentFromState;
      const intent = choose(state, seat, {
        ...config.allOpts, ...config.seatOpts?.[seat],
        level: levels[seat], rng: botRng[seat]!,
        ...(config.budgetMs !== undefined ? { budgetMs: config.budgetMs } : {}),
        ...(config.samples !== undefined ? { samples: config.samples } : {}),
        ...(config.horizonTurns !== undefined ? { horizonTurns: config.horizonTurns } : {}),
        ...(config.maxEvals !== undefined ? { maxEvals: config.maxEvals } : {}),
      });
      lines[seat].decisionMs += performance.now() - startedAt;
      lines[seat].decisions += 1;
      if (!intent) { stoppedEarly = "no_legal_intents"; break; }
      let result = applyIntent(state, intent, { seat, rng: engineRng });
      let applied = intent;
      if (!result.ok) {
        // A bot-built answer to a choice can break a rule only the engine knows; the engine's default always works.
        fallbacks += 1;
        config.onRejected?.({ state, seat, intent, message: result.error?.message ?? "" });
        applied = listLegalIntents(state, seat)[0]!;
        result = applyIntent(state, applied, { seat, rng: engineRng });
        if (!result.ok) { stoppedEarly = `engine_rejected: ${result.error?.message ?? "unknown"}`; break; }
      }
      tallyIntent(lines[seat], state, seat, applied, result.events, lastActivated[seat]);
      replay.intents.push({ seat, intent: applied });
      state = result.state;
    }
  } catch (error) {
    stoppedEarly = `engine_error: ${(error as Error).message}`;
  }
  if (state.winner !== null && state.winReason) replay.end = { winner: state.winner, reason: state.winReason };
  return { replay, winner: state.winner, turns: state.turnNumber, intents: replay.intents.length, fallbacks, lines, ...(stoppedEarly ? { stoppedEarly } : {}) };
}

// --- CLI --------------------------------------------------------------------------------------

interface DeckFile { name?: string; leaderId: string; deck: string[] }

export interface SelfPlaySummary {
  games: number;
  finished: number;
  stopped: Record<string, number>;
  avgTurns: number;
  avgIntents: number;
  fallbacks: number;
  gamesPerSec: number;
  winsBySeat: [number, number];
  /** Wins by level when the levels differ: index = seat 0 / seat 1 level. */
  winsByLevel: Record<string, number>;
  byLeader: Record<string, { games: number; wins: number }>;
  /** Advanced lines per level (both seats of that level, all games). */
  lines: Record<string, LineTally>;
}

export function runSelfPlay(opts: { games: number; seed: number; levels: [BotLevel, BotLevel]; decks?: DeckFile[]; /** Levels differ: play games in pairs with the same decks, shuffles and seats, levels swapped. */ paired?: boolean; budgetMs?: number; samples?: number; horizonTurns?: 1 | 2; maxEvals?: number; onReplay?: (r: MatchReplay) => void }): SelfPlaySummary {
  const summary: SelfPlaySummary = { games: 0, finished: 0, stopped: {}, avgTurns: 0, avgIntents: 0, fallbacks: 0, gamesPerSec: 0, winsBySeat: [0, 0], winsByLevel: {}, byLeader: {}, lines: {} };
  const started = Date.now();
  let turns = 0;
  let intents = 0;
  for (let g = 0; g < opts.games; g += 1) {
    const paired = Boolean(opts.paired) && opts.levels[0] !== opts.levels[1];
    const seed = opts.seed + (paired ? Math.floor(g / 2) : g);
    const deckRng = createSeededRng(mix(seed, 4));
    const pick = (): PlayerDeckConfig => (opts.decks ? (({ leaderId, deck }) => ({ leaderId, deck }))(opts.decks[deckRng.nextInt(opts.decks.length)]!) : randomDeck(deckRng));
    const players: [PlayerDeckConfig, PlayerDeckConfig] = [pick(), pick()];
    // Alternate which level sits in which seat so a level gap is not a seat effect.
    const swap = opts.levels[0] !== opts.levels[1] && g % 2 === 1;
    const levels: [BotLevel, BotLevel] = swap ? [opts.levels[1], opts.levels[0]] : opts.levels;
    const r = playBotGame({ seed, players, levels, ...(opts.budgetMs !== undefined ? { budgetMs: opts.budgetMs } : {}), ...(opts.samples !== undefined ? { samples: opts.samples } : {}), ...(opts.horizonTurns !== undefined ? { horizonTurns: opts.horizonTurns } : {}), ...(opts.maxEvals !== undefined ? { maxEvals: opts.maxEvals } : {}) });
    opts.onReplay?.(r.replay);
    summary.games += 1;
    turns += r.turns;
    intents += r.intents;
    summary.fallbacks += r.fallbacks;
    for (const seat of [0, 1] as Seat[]) mergeTally((summary.lines[levels[seat]] ??= emptyTally()), r.lines[seat]);
    for (const seat of [0, 1] as Seat[]) {
      const row = (summary.byLeader[players[seat].leaderId] ??= { games: 0, wins: 0 });
      row.games += 1;
      if (r.winner === seat) row.wins += 1;
    }
    if (r.stoppedEarly) summary.stopped[r.stoppedEarly.split(":")[0]!] = (summary.stopped[r.stoppedEarly.split(":")[0]!] ?? 0) + 1;
    if (r.winner !== null) {
      summary.finished += 1;
      summary.winsBySeat[r.winner] += 1;
      summary.winsByLevel[levels[r.winner]] = (summary.winsByLevel[levels[r.winner]] ?? 0) + 1;
    }
  }
  summary.avgTurns = turns / Math.max(1, summary.games);
  summary.avgIntents = intents / Math.max(1, summary.games);
  summary.gamesPerSec = summary.games / Math.max(0.001, (Date.now() - started) / 1000);
  return summary;
}

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

function top(m: Record<string, number>, n = 8): string {
  const rows = Object.entries(m).sort((x, y) => y[1] - x[1]).slice(0, n);
  return rows.length ? rows.map(([k, v]) => `${k} x${v}`).join(", ") : "none";
}

if (process.argv[1] && /selfPlay\.ts$/.test(process.argv[1])) {
  const games = Number(arg("games") ?? 10);
  const seed = Number(arg("seed") ?? 1);
  const [a, b] = (arg("levels") ?? "normal,normal").split(",") as BotLevel[];
  const levels: [BotLevel, BotLevel] = [a ?? "normal", b ?? a ?? "normal"];
  const decksPath = arg("decks");
  const decks = decksPath ? (JSON.parse(readFileSync(decksPath, "utf8")) as DeckFile[]) : undefined;
  const dir = arg("out") ?? "selfplay-out";
  const budgetMs = arg("budget-ms") !== undefined ? Number(arg("budget-ms")) : undefined;
  const samples = arg("samples") !== undefined ? Number(arg("samples")) : undefined;
  const horizonTurns = arg("horizon") === "2" ? 2 : arg("horizon") === "1" ? 1 : undefined;
  const maxEvals = arg("max-evals") !== undefined ? Number(arg("max-evals")) : undefined;
  const paired = process.argv.includes("--paired");
  mkdirSync(dir, { recursive: true });
  const file = join(dir, `selfplay-${levels.join("-")}-seed${seed}-n${games}.jsonl`);
  const lines: string[] = [];
  const s = runSelfPlay({ games, seed, levels, paired, ...(decks ? { decks } : {}), ...(budgetMs !== undefined ? { budgetMs } : {}), ...(samples !== undefined ? { samples } : {}), ...(horizonTurns ? { horizonTurns } : {}), ...(maxEvals !== undefined ? { maxEvals } : {}), onReplay: (r) => lines.push(JSON.stringify(r)) });
  writeFileSync(file, `${lines.join("\n")}\n`);
  writeFileSync(file.replace(/\.jsonl$/, ".summary.json"), JSON.stringify(s, null, 1));
  const leaders = Object.entries(s.byLeader).sort((x, y) => y[1].games - x[1].games);
  console.log(`selfplay: ${s.games} games (${levels.join(" vs ")}), ${s.finished} finished (${((100 * s.finished) / s.games).toFixed(1)}%), stopped ${JSON.stringify(s.stopped)}`);
  console.log(`avg turns ${s.avgTurns.toFixed(1)}, avg intents ${s.avgIntents.toFixed(0)}, ${s.gamesPerSec.toFixed(2)} games/sec, ${s.fallbacks} bot answers rejected (engine default used)`);
  console.log(`wins by seat ${s.winsBySeat.join("/")}, by level ${JSON.stringify(s.winsByLevel)}`);
  console.log(`win rate by leader (top 15 by games):`);
  for (const [id, r] of leaders.slice(0, 15)) console.log(`  ${id}: ${r.wins}/${r.games} (${((100 * r.wins) / r.games).toFixed(0)}%)`);
  for (const [level, t] of Object.entries(s.lines)) {
    console.log(`lines played by ${level}: ${t.activations} Activate:Main (${t.leaderActivations} from Leaders), ${t.decisions} decisions, ${(t.decisionMs / Math.max(1, t.decisions)).toFixed(1)} ms/decision`);
    console.log(`  activations by card: ${top(t.activationsByCard)}`);
    console.log(`  optional effects accepted: ${top(t.optionalAccepts)}; declined: ${top(t.optionalDeclines)}`);
    console.log(`  counter events: ${top(t.counterEvents)}`);
    console.log(`  cheat-outs (characters entering play not from the hand): ${top(t.cheatOuts)}`);
    console.log(`  [Main] events played: ${top(t.mainEvents)}`);
  }
  console.log(`wrote ${file}`);
}
