/**
 * Goldfish runs for Log Pose (#402): plays a deck in the duel engine against a dummy that never blocks,
 * counters or attacks, and reports speed numbers with intervals. The engine side lives in
 * `@optcg/rules` (`sim/goldfish.ts`); this file adds the limits a public server needs: a time budget,
 * one simulation at a time, a cache, and a source id that changes with the question and the engine.
 */
import { REGISTRY_HASH, goldfishRun, hasCardDef, summarizeGoldfish, type GoldfishLine, type GoldfishRun, type GoldfishSetup } from "@optcg/rules";
import type { Catalog } from "./catalog";
import type { Deck } from "./decks";
import { deckSourceId, shortHash } from "./sources";

/** The question with every default filled in. */
export interface SimQuery {
  goingFirst: boolean;
  turns: number;
  opponentLife: number;
  opponentPower: number;
  mulligan: "auto" | "never";
  keepCards: string[];
  line: GoldfishLine;
  track: string[];
  runs: number;
  seed?: number;
}

/** The question as the tool receives it. */
export type SimInput = Partial<SimQuery>;

export interface SimDeps {
  now?: () => number;
  budgetMs?: number;
  yieldNow?: () => Promise<void>;
  run?: (setup: GoldfishSetup, seed: number) => GoldfishRun;
  log?: (line: string) => void;
}

const BUSY = "Log Pose is already running simulations; try again in a minute.";
const MAX_WAITING = 2;
const CACHE_SIZE = 32;
const DEFAULT_BUDGET_MS = 20_000;
const SEED_STEP = 0x9e3779b1;

export function resolveQuery(q: SimInput): SimQuery {
  return {
    goingFirst: q.goingFirst ?? true,
    turns: q.turns ?? 6,
    opponentLife: q.opponentLife ?? 5,
    opponentPower: q.opponentPower ?? 5000,
    mulligan: q.mulligan ?? "auto",
    keepCards: q.keepCards ?? [],
    line: q.line ?? "auto",
    track: q.track ?? [],
    runs: q.runs ?? 100,
    ...(q.seed !== undefined ? { seed: q.seed } : {}),
  };
}

type DeckKey = Pick<Deck, "leaderId" | "cards">;

/** The question, the deck and the engine version as one string; `seed` is null until it is known. */
function canonicalOf(deck: DeckKey, q: SimQuery, seed: number | null): string {
  return JSON.stringify({
    v: 1,
    deck: deckSourceId(deck.leaderId ?? undefined, deck.cards),
    goingFirst: q.goingFirst,
    turns: q.turns,
    opponentLife: q.opponentLife,
    opponentPower: q.opponentPower,
    mulligan: q.mulligan,
    keepCards: [...q.keepCards].sort(),
    line: q.line,
    track: [...q.track].sort(),
    seed,
    runs: q.runs,
    registry: REGISTRY_HASH,
  });
}

/** The first game's seed: the asked one, or one derived from the question, so the same question plays the same games. */
function baseSeed(deck: DeckKey, q: SimQuery): number {
  return q.seed ?? parseInt(shortHash(canonicalOf(deck, q, null)), 16);
}

/** `sim:<hash>`: the same question on the same deck and engine, answered by the same number of games, cites the same source. */
export function simSourceId(deck: DeckKey, q: SimQuery, runsCompleted: number): string {
  const canonical = canonicalOf(deck, q, baseSeed(deck, q));
  return `sim:${shortHash(canonical + "|" + runsCompleted)}`;
}

// ——— one simulation at a time ———

let running = false;
const waiting: (() => void)[] = [];

/** Runs `fn` when no other simulation is running; up to two callers wait their turn and any more are refused. */
export async function exclusive<T>(fn: () => Promise<T>): Promise<T> {
  if (running) {
    if (waiting.length >= MAX_WAITING) throw new Error(BUSY);
    await new Promise<void>((resolve) => waiting.push(resolve));
  } else running = true;
  try {
    return await fn();
  } finally {
    const next = waiting.shift();
    if (next) next();
    else running = false;
  }
}

// ——— cache ———

const cache = new Map<string, SimResult>();
export function clearSimCache(): void {
  cache.clear();
}

const defaultYield = () => new Promise<void>((resolve) => setImmediate(resolve));
const envBudget = () => {
  const n = Number(process.env.ANALYST_SIM_BUDGET_MS);
  return Number.isFinite(n) && n > 0 ? n : DEFAULT_BUDGET_MS;
};

const TURN_NOTE = "Turn N means your own Nth turn; going first you skip the turn-1 draw and get 1 DON!!.";
const POLICY_NOTE =
  "The pilot is a script, not a strong player: each turn it plays the Characters and Stage that spend the most DON!!, uses Activate: Main abilities, gives DON!! to attackers so they reach the dummy's power, plays Main Events with what is left and attacks the Leader with everything; it also tries attacking first and keeps that line when only it wins the turn. " +
  "Removal and effects that need opponent Characters do nothing against the empty board.";

function describeSim(catalog: Catalog, deck: Deck, q: SimQuery, base: number, setup: GoldfishSetup, runs: GoldfishRun[], truncated: boolean, notes: string[]) {
  const count = deck.cards.reduce((n, c) => n + c.copies, 0);
  const summary = summarizeGoldfish(setup, runs);
  const name = (id: string) => catalog.cards.get(id)?.name ?? id;
  const n = runs.length;
  return {
    sourceId: simSourceId(deck, q, n),
    deck: { name: deck.name, leader: { id: deck.leaderId!, name: name(deck.leaderId!) }, mainDeckCount: count },
    setup: {
      runs: n,
      runsRequested: q.runs,
      truncated,
      goingFirst: q.goingFirst,
      turns: q.turns,
      opponent: { life: q.opponentLife, power: q.opponentPower },
      mulligan: q.mulligan,
      keepCards: q.keepCards.map((id) => ({ id, name: name(id) })),
      line: q.line,
      seed: base,
    },
    lethal: { wins: summary.wins, byTurn: summary.byTurn, fastestWinTurn: summary.fastestWinTurn, medianWinTurn: summary.medianWinTurn },
    openingHand: {
      mulligans: summary.mulligans,
      mulliganPercent: n ? Math.round((summary.mulligans / n) * 1000) / 10 : 0,
      keepCardPercent: summary.keepCardRuns === null ? null : n ? Math.round((summary.keepCardRuns / n) * 1000) / 10 : 0,
    },
    curve: summary.curve,
    cards: summary.cards.map((c) => ({ id: c.id, name: name(c.id), byTurn: c.byTurn })),
    example: summary.example
      ? {
          seed: summary.example.seed,
          winTurn: summary.example.winTurn,
          turns: summary.example.turns.map((t) => ({ turn: t.turn, line: t.line, played: t.played.map(name), donGiven: t.donGiven, attacks: t.attacks, hits: t.hits, opponentLife: t.opponentLife })),
        }
      : null,
    support: {
      complete: summary.flagged.length === 0,
      flagged: summary.flagged.map((f) => ({ id: f.id, name: name(f.id), support: f.support })),
      runsAffected: summary.runsAffected,
    },
    errors: { runs: summary.errors, first: summary.firstError },
    notes,
  };
}

export type SimResult = ReturnType<typeof describeSim>;

export async function simulateDeck(catalog: Catalog, deck: Deck, input: SimInput, deps: SimDeps = {}): Promise<SimResult> {
  if (!deck.leaderId) throw new Error("simulate needs a leader.");
  const count = deck.cards.reduce((n, c) => n + c.copies, 0);
  if (count !== 50) throw new Error(`simulate needs exactly 50 main-deck cards; this list has ${count}.`);
  const missing = [deck.leaderId, ...deck.cards.map((c) => c.id)].filter((id) => !hasCardDef(id));
  if (missing.length) throw new Error(`The duel engine doesn't have ${[...new Set(missing)].join(", ")}; simulate can't play this deck yet.`);

  const inDeck = new Set(deck.cards.map((c) => c.id));
  const normalize = (ids: string[] | undefined) => [...new Set((ids ?? []).map((id) => id.trim().toUpperCase()))];
  const wanted = { keepCards: normalize(input.keepCards), track: normalize(input.track) };
  const dropped = [...new Set([...wanted.keepCards, ...wanted.track].filter((id) => !inDeck.has(id)))];
  const q = resolveQuery({ ...input, keepCards: wanted.keepCards.filter((id) => inDeck.has(id)), track: wanted.track.filter((id) => inDeck.has(id)) });
  const notes = [TURN_NOTE, POLICY_NOTE, ...(dropped.length ? [`Left out of keepCards and track because they are not in the main deck: ${dropped.join(", ")}.`] : [])];

  const base = baseSeed(deck, q);
  const key = canonicalOf(deck, q, base);
  const hit = cache.get(key);
  if (hit) {
    cache.delete(key);
    cache.set(key, hit);
    return hit;
  }

  const now = deps.now ?? Date.now;
  const budgetMs = deps.budgetMs ?? envBudget();
  const yieldNow = deps.yieldNow ?? defaultYield;
  const play = deps.run ?? goldfishRun;
  const setup: GoldfishSetup = {
    leaderId: deck.leaderId,
    deck: deck.cards.flatMap((c) => Array<string>(c.copies).fill(c.id)).sort(),
    goingFirst: q.goingFirst,
    turns: q.turns,
    opponentLife: q.opponentLife,
    opponentPower: q.opponentPower,
    mulligan: q.mulligan,
    keepCards: q.keepCards,
    line: q.line,
    track: q.track,
  };

  const started = now();
  const runs: GoldfishRun[] = [];
  let truncated = false;
  for (let i = 0; i < q.runs; i += 1) {
    if (i > 0 && now() - started > budgetMs) { truncated = true; break; }
    runs.push(play(setup, (base + i * SEED_STEP) >>> 0));
    await yieldNow();
  }
  const elapsed = now() - started;
  (deps.log ?? console.log)(`simulate: ${runs.length}/${q.runs} runs in ${elapsed} ms (${Math.round(elapsed / Math.max(1, runs.length))} ms/run)`);

  const result = describeSim(catalog, deck, q, base, setup, runs, truncated, notes);
  // A game count cut short by the clock depends on how busy the server was, so only complete answers are kept.
  if (!truncated) {
    cache.set(key, result);
    if (cache.size > CACHE_SIZE) cache.delete(cache.keys().next().value!);
  }
  return result;
}
