/**
 * Self-play recorder (#631): bot vs bot through the real engine, saved as MatchReplays.
 *
 * Usage: npx tsx src/sim/selfPlay.ts --games 100 --seed 1 [--decks decks.json] [--levels normal,normal] [--out dir]
 * decks.json = [{ "name", "leaderId", "deck": [50 ids] }]; without it every game gets two random decks.
 */
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { REGISTRY_HASH } from "../cards/abilities.js";
import { chooseBotIntent, type BotLevel } from "../bot/index.js";
import { applyIntent, createMatch, getPlayerView } from "../engine.js";
import type { MatchReplay } from "../matchReplay.js";
import { createSeededRng } from "../rng.js";
import { RULES_VERSION } from "../state/snapshot.js";
import type { MatchState, PlayerDeckConfig, Seat } from "../types.js";
import { randomDeck } from "./fuzz.js";

export interface BotGameConfig {
  seed: number;
  players: [PlayerDeckConfig, PlayerDeckConfig];
  levels: [BotLevel, BotLevel];
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
}

/** The seat that has something to do: the owner of the front pending choice, else the mulligan, defender or active seat. */
function actingSeat(state: MatchState): Seat {
  const front = state.pendingChoices[0];
  if (front) return front.seat;
  if (state.phase === "mulligan") return state.players[0].mulliganDone ? 1 : 0;
  if ((state.phase === "block" || state.phase === "counter") && state.battle) return state.battle.attackerSeat === 0 ? 1 : 0;
  return state.activeSeat;
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
  try {
    while (state.winner === null) {
      if (replay.intents.length >= maxIntents) { stoppedEarly = "max_intents"; break; }
      const seat = actingSeat(state);
      const view = getPlayerView(state, seat);
      const intent = chooseBotIntent(view, { level: levels[seat], rng: botRng[seat]! });
      if (!intent) { stoppedEarly = "no_legal_intents"; break; }
      let result = applyIntent(state, intent, { seat, rng: engineRng });
      let applied = intent;
      if (!result.ok) {
        // A bot-built answer to a choice can break a rule only the engine knows; the engine's default always works.
        fallbacks += 1;
        applied = view.legalIntents[0]!;
        result = applyIntent(state, applied, { seat, rng: engineRng });
        if (!result.ok) { stoppedEarly = `engine_rejected: ${result.error?.message ?? "unknown"}`; break; }
      }
      replay.intents.push({ seat, intent: applied });
      state = result.state;
    }
  } catch (error) {
    stoppedEarly = `engine_error: ${(error as Error).message}`;
  }
  if (state.winner !== null && state.winReason) replay.end = { winner: state.winner, reason: state.winReason };
  return { replay, winner: state.winner, turns: state.turnNumber, intents: replay.intents.length, fallbacks, ...(stoppedEarly ? { stoppedEarly } : {}) };
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
}

export function runSelfPlay(opts: { games: number; seed: number; levels: [BotLevel, BotLevel]; decks?: DeckFile[]; onReplay?: (r: MatchReplay) => void }): SelfPlaySummary {
  const summary: SelfPlaySummary = { games: 0, finished: 0, stopped: {}, avgTurns: 0, avgIntents: 0, fallbacks: 0, gamesPerSec: 0, winsBySeat: [0, 0], winsByLevel: {}, byLeader: {} };
  const started = Date.now();
  let turns = 0;
  let intents = 0;
  for (let g = 0; g < opts.games; g += 1) {
    const seed = opts.seed + g;
    const deckRng = createSeededRng(mix(seed, 4));
    const pick = (): PlayerDeckConfig => (opts.decks ? (({ leaderId, deck }) => ({ leaderId, deck }))(opts.decks[deckRng.nextInt(opts.decks.length)]!) : randomDeck(deckRng));
    const players: [PlayerDeckConfig, PlayerDeckConfig] = [pick(), pick()];
    // Alternate which level sits in which seat so a level gap is not a seat effect.
    const swap = opts.levels[0] !== opts.levels[1] && g % 2 === 1;
    const levels: [BotLevel, BotLevel] = swap ? [opts.levels[1], opts.levels[0]] : opts.levels;
    const r = playBotGame({ seed, players, levels });
    opts.onReplay?.(r.replay);
    summary.games += 1;
    turns += r.turns;
    intents += r.intents;
    summary.fallbacks += r.fallbacks;
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

if (process.argv[1] && /selfPlay\.ts$/.test(process.argv[1])) {
  const games = Number(arg("games") ?? 10);
  const seed = Number(arg("seed") ?? 1);
  const [a, b] = (arg("levels") ?? "normal,normal").split(",") as BotLevel[];
  const levels: [BotLevel, BotLevel] = [a ?? "normal", b ?? a ?? "normal"];
  const decksPath = arg("decks");
  const decks = decksPath ? (JSON.parse(readFileSync(decksPath, "utf8")) as DeckFile[]) : undefined;
  const dir = arg("out") ?? "selfplay-out";
  mkdirSync(dir, { recursive: true });
  const file = join(dir, `selfplay-${levels.join("-")}-seed${seed}-n${games}.jsonl`);
  const lines: string[] = [];
  const s = runSelfPlay({ games, seed, levels, ...(decks ? { decks } : {}), onReplay: (r) => lines.push(JSON.stringify(r)) });
  writeFileSync(file, `${lines.join("\n")}\n`);
  const leaders = Object.entries(s.byLeader).sort((x, y) => y[1].games - x[1].games);
  console.log(`selfplay: ${s.games} games (${levels.join(" vs ")}), ${s.finished} finished (${((100 * s.finished) / s.games).toFixed(1)}%), stopped ${JSON.stringify(s.stopped)}`);
  console.log(`avg turns ${s.avgTurns.toFixed(1)}, avg intents ${s.avgIntents.toFixed(0)}, ${s.gamesPerSec.toFixed(2)} games/sec, ${s.fallbacks} bot answers rejected (engine default used)`);
  console.log(`wins by seat ${s.winsBySeat.join("/")}, by level ${JSON.stringify(s.winsByLevel)}`);
  console.log(`win rate by leader (top 15 by games):`);
  for (const [id, r] of leaders.slice(0, 15)) console.log(`  ${id}: ${r.wins}/${r.games} (${((100 * r.wins) / r.games).toFixed(0)}%)`);
  console.log(`wrote ${file}`);
}
