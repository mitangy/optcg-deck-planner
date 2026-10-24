/**
 * Builds the puzzle set (#677): positions from self-play and from the Harness, a generator per type, and quotas for how many
 * puzzles come from synthetic boards and from the newest sets. Deterministic for a seed and the same decks.
 */
import { createSeededRng, type MatchState, type Rng } from "@optcg/rules";
import type { Catalog } from "../../src/catalog";
import { DEFEND_MIX, defendPuzzle } from "./defend";
import { POSITION_GENERATORS, POWER_MIX, type Made } from "./generators";
import { lethalPuzzle } from "./lethal";
import { lethalPosition, selfPlayPositions, syntheticPositions, type DeckSource, type Position } from "./positions";
import { scenarioChainPuzzles, scenarioPuzzles } from "./scenario";
import { PUZZLE_TYPES, type Puzzle, type PuzzleType } from "./types";

export type GenerateOptions = {
  seed: number;
  /** Puzzles per type. */
  n: number;
  types?: readonly PuzzleType[];
  /** Share of puzzles with a card from OP18 / EB05. */
  newShare?: number;
  /** Share of position puzzles built by the Harness instead of sampled from self-play. */
  synthShare?: number;
  decks?: DeckSource[];
  catalog: Catalog;
  /** Position batches to try before giving up on a short type (default 6). */
  maxRounds?: number;
};

export type GenerateResult = {
  puzzles: Puzzle[];
  /** Positions a generator turned down, by type. */
  rejected: Record<string, number>;
  /** Types that ended with fewer than `n` puzzles. */
  short: Record<string, number>;
};

const hash = (...xs: (string | number)[]): number => {
  let h = 2166136261;
  for (const ch of xs.join("|")) h = Math.imul(h ^ ch.charCodeAt(0), 16777619);
  return h >>> 0;
};

/** The types that start from a sampled or Harness position (the lethal type builds its own boards, the scenario types come from rows). */
const GENERATORS: Record<string, (state: MatchState, catalog: Catalog, rng: Rng, prefer?: string) => Made | null> = { ...POSITION_GENERATORS, defend: defendPuzzle };

/** Share of puzzles by first tag, for the types that are steered toward a mix. */
const TYPE_MIX: Record<string, Record<string, number>> = { power: POWER_MIX, defend: DEFEND_MIX };

/** Boards the lethal builder is asked for per puzzle wanted, before giving up on a short set. */
const LETHAL_TRIES = 25;

const cellOf = (synthetic: boolean, newSet: boolean) => `${synthetic ? "harness" : "selfplay"}-${newSet ? "new" : "old"}`;

/** How many puzzles each (source, new-set) cell may hold so the shares come out as asked. */
export function quotas(n: number, synthShare: number, newShare: number): Record<string, number> {
  const synth = Math.round(n * synthShare);
  const self = n - synth;
  const newSynth = Math.round(synth * newShare);
  const newSelf = Math.round(self * newShare);
  return { [cellOf(true, true)]: newSynth, [cellOf(true, false)]: synth - newSynth, [cellOf(false, true)]: newSelf, [cellOf(false, false)]: self - newSelf };
}

/** The kind of puzzle furthest below its share so far. */
function nextKind(have: readonly { tags: string[] }[], n: number, mix: Record<string, number>): string {
  const short = (kind: string) => Math.ceil(n * mix[kind]!) - have.filter((p) => p.tags[0] === kind).length;
  return Object.keys(mix).sort((a, b) => short(b) - short(a))[0]!;
}

export function generatePuzzles(opts: GenerateOptions): GenerateResult {
  const types = opts.types ?? PUZZLE_TYPES;
  const newShare = opts.newShare ?? 0.3;
  const synthShare = opts.synthShare ?? 0.5;
  const maxRounds = opts.maxRounds ?? 6;
  const { n, seed, catalog } = opts;
  const rejected: Record<string, number> = {};
  const short: Record<string, number> = {};
  const byType = new Map<PuzzleType, Puzzle[]>();
  const cellCount = new Map<PuzzleType, Record<string, number>>();
  const goal = quotas(n, synthShare, newShare);
  const positionTypes = types.filter((t) => t in GENERATORS);

  for (let round = 0; round < maxRounds && positionTypes.some((t) => (byType.get(t)?.length ?? 0) < n); round += 1) {
    const roundSeed = seed * 1000 + round;
    const batch: Position[] = [
      ...selfPlayPositions({ seed: roundSeed, games: Math.max(6, Math.ceil(n / 2)), perGame: 3, newShare, decks: opts.decks, catalog }),
      ...syntheticPositions({ seed: roundSeed, count: Math.max(10, Math.ceil(n * synthShare * 3)), newShare, catalog }),
    ];
    const strict = round < maxRounds - 2;
    for (const type of positionTypes) {
      const have = byType.get(type) ?? [];
      const cells = cellCount.get(type) ?? {};
      const order = createSeededRng(hash(seed, round, type)).shuffle([...batch]);
      for (const pos of order) {
        if (have.length >= n) break;
        const mix = TYPE_MIX[type];
        const prefer = mix ? nextKind(have, n, mix) : undefined;
        const made = GENERATORS[type]!(pos.state, catalog, createSeededRng(hash(seed, pos.id, type)), prefer);
        if (!made) {
          rejected[type] = (rejected[type] ?? 0) + 1;
          continue;
        }
        const cell = cellOf(pos.synthetic, made.newSet);
        if (strict && (cells[cell] ?? 0) >= (goal[cell] ?? 0)) continue;
        if (strict && mix && have.filter((p) => p.tags[0] === made.tags[0]).length >= Math.ceil(n * (mix[made.tags[0]!] ?? 1))) continue;
        cells[cell] = (cells[cell] ?? 0) + 1;
        have.push({ ...made, id: "", source: pos.source });
      }
      byType.set(type, have);
      cellCount.set(type, cells);
    }
  }

  if (types.includes("scenario")) {
    const rng = createSeededRng(hash(seed, "scenario"));
    const all = rng.shuffle(scenarioPuzzles(catalog));
    const fresh = all.filter((p) => p.newSet).slice(0, Math.round(n * newShare));
    const rest = all.filter((p) => !fresh.includes(p));
    byType.set("scenario", [...fresh, ...rest].slice(0, n));
  }

  if (types.includes("scenario_chain")) {
    const rng = createSeededRng(hash(seed, "scenario_chain"));
    const all = rng.shuffle(scenarioChainPuzzles(catalog));
    const fresh = all.filter((p) => p.newSet).slice(0, Math.round(n * newShare));
    const rest = all.filter((p) => !fresh.includes(p));
    byType.set("scenario_chain", [...fresh, ...rest].slice(0, n));
  }

  if (types.includes("lethal")) {
    // Boards built for the puzzle, one at a time; the first half of the tries keep to the new-set share, the rest take what fits.
    const rng = createSeededRng(hash(seed, "lethal"));
    const have: Puzzle[] = [];
    const wantNew = Math.round(n * newShare);
    for (let i = 0; i < n * LETHAL_TRIES && have.length < n; i += 1) {
      const fresh = have.filter((p) => p.newSet).length;
      const strict = i < (n * LETHAL_TRIES) / 2;
      const pos = (() => {
        try {
          return lethalPosition(rng, catalog, fresh < wantNew && rng.next() < 0.7, `lx${seed}-${i}`);
        } catch {
          return undefined;
        }
      })();
      if (!pos) continue;
      const made = lethalPuzzle(pos.state, catalog, createSeededRng(hash(seed, pos.id, "lethal")));
      if (!made) {
        rejected.lethal = (rejected.lethal ?? 0) + 1;
        continue;
      }
      if (strict && ((made.newSet && fresh >= wantNew) || (!made.newSet && have.length - fresh >= n - wantNew))) continue;
      have.push({ ...made, id: "", source: pos.source });
    }
    byType.set("lethal", have);
  }

  const puzzles: Puzzle[] = [];
  for (const type of types) {
    const list = byType.get(type) ?? [];
    if (list.length < n) short[type] = n - list.length;
    list.forEach((p, k) => puzzles.push({ ...p, id: `${type}-s${seed}-${k + 1}` }));
  }
  return { puzzles, rejected, short };
}
