/**
 * Bot self-play games for Log Pose's corpus (#635): the line tallies of a replay, the upload to the planner, and
 * lesson candidates where bot games and real games show the same thing.
 *
 * The tally is the one the self-play recorder uses (packages/rules/src/sim/selfPlay.ts tallyIntent), re-run over a
 * saved replay, so a JSONL file made before tallies were stored can still be uploaded with them.
 */
import { replayApply, replayStart, type MatchReplay, type Seat } from "@optcg/rules";
import { emptyTally, tallyIntent, type LineTally } from "@optcg/rules/src/sim/selfPlay";
import { plannerCall, type PlannerApi } from "./matches";

export type { LineTally };

/** Replay one game and tally the advanced lines each seat played, plus the turn the game ended on. */
export function tallyReplay(replay: MatchReplay): { tallies: [LineTally, LineTally]; turns: number } {
  const tallies: [LineTally, LineTally] = [emptyTally(), emptyTally()];
  const lastActivated: [string[], string[]] = [[], []];
  let state = replayStart(replay);
  for (let i = 0; i < replay.intents.length; i += 1) {
    const { seat, intent } = replay.intents[i]!;
    const before = state;
    const applied = replayApply(state, replay, i);
    tallies[seat].decisions += 1;
    tallyIntent(tallies[seat], before, seat, intent, applied.events, lastActivated[seat]);
    state = applied.state;
  }
  return { tallies, turns: state.turnNumber };
}

/** The named lines a side played in one game; keep in step with lines_of in backend/app/analyst_bots.py. */
export function linesOf(t: Partial<LineTally>): Set<string> {
  const out = new Set<string>();
  if ((t.leaderActivations ?? 0) > 0) out.add("leader_activation");
  const used = (m: Record<string, number> | undefined) => Object.entries(m ?? {}).filter(([, n]) => n > 0).map(([k]) => k);
  for (const c of used(t.activationsByCard)) out.add(`activation:${c}`);
  for (const c of used(t.optionalAccepts)) out.add(`optional_accepted:${c}`);
  for (const c of used(t.optionalDeclines)) out.add(`optional_declined:${c}`);
  const counters = used(t.counterEvents);
  if (counters.length) out.add("counter_event");
  for (const c of counters) out.add(`counter_event:${c}`);
  const cheats = used(t.cheatOuts);
  if (cheats.length) out.add("cheat_out");
  for (const c of cheats) out.add(`cheat_out:${c}`);
  for (const c of used(t.mainEvents)) out.add(`main_event:${c}`);
  return out;
}

export type BotGameUpload = { index: number; replay: MatchReplay; tallies: [LineTally, LineTally]; turns: number; levels?: string };

/** Games from a JSONL file: one replay per line, or { replay, tallies } wrappers. Blank and unparseable lines are skipped and counted. */
export function parseJsonl(text: string): { replays: { replay: MatchReplay; tallies?: [LineTally, LineTally] }[]; skipped: number } {
  const replays: { replay: MatchReplay; tallies?: [LineTally, LineTally] }[] = [];
  let skipped = 0;
  for (const line of text.split(/\r?\n/)) {
    if (!line.trim()) continue;
    try {
      const v = JSON.parse(line) as Record<string, unknown>;
      const replay = (v.replay ?? v) as MatchReplay;
      if (!Array.isArray(replay.players) || !Array.isArray(replay.intents)) throw new Error("not a replay");
      const t = (v.tallies ?? v.lines) as [LineTally, LineTally] | undefined;
      replays.push({ replay, ...(Array.isArray(t) && t.length === 2 ? { tallies: t } : {}) });
    } catch {
      skipped += 1;
    }
  }
  return { replays, skipped };
}

export const MAX_BATCH_GAMES = 25;
export const DEFAULT_BATCH_BYTES = 6 * 1024 * 1024;

/** Split games into request bodies of at most `maxGames` games and about `maxBytes` of JSON. A single game over the size alone goes by itself. */
export function toBatches(games: BotGameUpload[], maxBytes = DEFAULT_BATCH_BYTES, maxGames = MAX_BATCH_GAMES): BotGameUpload[][] {
  const out: BotGameUpload[][] = [];
  let cur: BotGameUpload[] = [];
  let size = 0;
  for (const g of games) {
    const bytes = JSON.stringify(g).length;
    if (cur.length && (cur.length >= maxGames || size + bytes > maxBytes)) {
      out.push(cur);
      cur = [];
      size = 0;
    }
    cur.push(g);
    size += bytes;
  }
  if (cur.length) out.push(cur);
  return out;
}

export type UploadResult = { accepted: number; duplicates: number; rejected: { index: number; reason: string }[] };

/** Send games to POST /analyst/bot-games in batches. The batch id plus each game's index make a re-run add nothing. */
export async function uploadBotGames(api: PlannerApi, batchId: string, levels: string, games: BotGameUpload[], opts: { maxBytes?: number } = {}): Promise<UploadResult> {
  const total: UploadResult = { accepted: 0, duplicates: 0, rejected: [] };
  for (const batch of toBatches(games, opts.maxBytes)) {
    const r = await plannerCall<UploadResult>(api, null, "/analyst/bot-games", true, {
      batch_id: batchId,
      levels,
      games: batch.map((g) => ({ index: g.index, replay: g.replay, tallies: g.tallies, turns: g.turns, ...(g.levels ? { levels: g.levels } : {}) })),
    });
    total.accepted += r.accepted;
    total.duplicates += r.duplicates;
    total.rejected.push(...r.rejected);
  }
  return total;
}

// ——— lessons both sources agree on ———

export type Rec = { games: number; wins: number | null; win_rate: number | null; too_few_games?: boolean };
export type LineRow = { line: string; description?: string; with: Rec; without: Rec };
export type RealLine = { line: string; withGames: number; withWins: number; withoutGames: number; withoutWins: number };

/** Win counts per line over real games of one leader: each game is the lines the leader's side played and whether it won. */
export function realLineStats(games: { lines: Set<string>; won: boolean }[]): RealLine[] {
  const names = new Set(games.flatMap((g) => [...g.lines]));
  return [...names].map((line) => {
    const w = games.filter((g) => g.lines.has(line));
    const wo = games.filter((g) => !g.lines.has(line));
    return { line, withGames: w.length, withWins: w.filter((g) => g.won).length, withoutGames: wo.length, withoutWins: wo.filter((g) => g.won).length };
  });
}

export type LessonCandidate = { line: string; description: string; direction: "better" | "worse"; bot: { withRate: number; withoutRate: number; withGames: number; withoutGames: number }; real: { withRate: number; withoutRate: number; withGames: number; withoutGames: number } };

export type CompareOptions = { minBotGames?: number; minRealGames?: number; minGapPoints?: number };

/** Lines where bot games and real games point the same way by at least minGapPoints, each with enough games on both sides of the line. */
export function compareLines(bot: LineRow[], real: RealLine[], opts: CompareOptions = {}): LessonCandidate[] {
  const minBot = opts.minBotGames ?? 20;
  const minReal = opts.minRealGames ?? 8;
  const gap = (opts.minGapPoints ?? 10) / 100;
  const byLine = new Map(real.map((r) => [r.line, r]));
  const out: LessonCandidate[] = [];
  for (const b of bot) {
    const r = byLine.get(b.line);
    if (!r || b.with.win_rate === null || b.without.win_rate === null) continue;
    if (b.with.games < minBot || b.without.games < minBot || r.withGames < minReal || r.withoutGames < minReal) continue;
    const realWith = r.withWins / r.withGames;
    const realWithout = r.withoutWins / r.withoutGames;
    const botDiff = b.with.win_rate - b.without.win_rate;
    const realDiff = realWith - realWithout;
    if (Math.sign(botDiff) !== Math.sign(realDiff) || Math.abs(botDiff) < gap || Math.abs(realDiff) < gap) continue;
    out.push({
      line: b.line,
      description: b.description ?? b.line,
      direction: botDiff > 0 ? "better" : "worse",
      bot: { withRate: b.with.win_rate, withoutRate: b.without.win_rate, withGames: b.with.games, withoutGames: b.without.games },
      real: { withRate: realWith, withoutRate: realWithout, withGames: r.withGames, withoutGames: r.withoutGames },
    });
  }
  return out.sort((a, b) => Math.abs(b.bot.withRate - b.bot.withoutRate) + Math.abs(b.real.withRate - b.real.withoutRate) - (Math.abs(a.bot.withRate - a.bot.withoutRate) + Math.abs(a.real.withRate - a.real.withoutRate)));
}

const pc = (x: number) => `${Math.round(x * 100)}%`;

/** A draft lesson's text. It says both numbers are correlations and keeps bot and real counts apart. */
export function lessonText(c: LessonCandidate, leaderName: string): string {
  const side = (s: LessonCandidate["bot"]) => `${pc(s.withRate)} vs ${pc(s.withoutRate)} (${s.withGames} and ${s.withoutGames} games)`;
  return (
    `With ${leaderName}, games where ${c.description} were won ${c.direction === "better" ? "more" : "less"} often than games without it: ` +
    `${side(c.real)} in real games, and ${side(c.bot)} in bot simulations. A pattern in the games, not proof of cause.`
  ).slice(0, 1000);
}

export type LessonDraftInput = { text: string; leader_id: string; opponent_id?: string; cards: string[] };

/** Card numbers a line is about (up to 10), for the lesson's card list. */
export function cardsOfLine(line: string): string[] {
  return [...new Set(line.match(/[A-Z]{2,4}\d{2}-\d{3}|P-\d{3}/g) ?? [])].slice(0, 10);
}
