import { normalizeCardId } from "@optcg/card-core";
import { OPENING_HAND, type DeckStatsCard, type StatsAtlas, type StatsAtlasCard } from "./deckStats";

export const ODDS_TURNS = 6;

export const MAX_ODDS_DECK = 1000;

const logFactCache: number[] = [0, 0];
function logFact(n: number): number {
  // The table grows to n, so an absurd deck size must not size it (NaN odds instead).
  if (!(n <= MAX_ODDS_DECK)) return NaN;
  for (let i = logFactCache.length; i <= n; i++) logFactCache[i] = logFactCache[i - 1]! + Math.log(i);
  return logFactCache[n]!;
}

export function hypergeomPmf(N: number, K: number, n: number, j: number): number {
  if (j < 0 || j > K || j > n || n - j > N - K || n > N) return 0;
  const logC = (a: number, b: number) => logFact(a) - logFact(b) - logFact(a - b);
  return Math.exp(logC(K, j) + logC(N - K, n - j) - logC(N, n));
}

export function hypergeomAtLeast(N: number, K: number, n: number, k: number): number {
  if (k <= 0) return 1;
  const draws = Math.min(n, N);
  let below = 0;
  for (let j = 0; j < k; j++) below += hypergeomPmf(N, K, draws, j);
  return Math.min(1, Math.max(0, 1 - below));
}

// Both players open with 5 cards and the player going first skips the draw on turn 1. Life cards are unseen random cards, so they do not matter.
export function cardsSeen(turn: number, goingFirst: boolean): number {
  return OPENING_HAND + (goingFirst ? turn - 1 : turn);
}

// The redrawn hand is a fresh 5 and later draws come from the same reshuffled deck, so the mulligan branch equals the plain odds for `seen` cards.
export function atLeastWithMulligan(N: number, K: number, seen: number, k: number): number {
  const open = Math.min(OPENING_HAND, N);
  const total = Math.min(seen, N);
  if (k <= 0) return 1;
  let keep = 0;
  for (let j = 1; j <= Math.min(K, open); j++) {
    keep += hypergeomPmf(N, K, open, j) * hypergeomAtLeast(N - open, K - j, total - open, k - j);
  }
  return Math.min(1, keep + hypergeomPmf(N, K, open, 0) * hypergeomAtLeast(N, K, total, k));
}

export type OddsOptions = { deckSize: number; hits: number; atLeast: number; goingFirst: boolean; mulligan: boolean; turns?: number };

export function oddsByTurn(o: OddsOptions): number[] {
  return Array.from({ length: o.turns ?? ODDS_TURNS }, (_, i) => {
    const seen = cardsSeen(i + 1, o.goingFirst);
    return o.mulligan ? atLeastWithMulligan(o.deckSize, o.hits, seen, o.atLeast) : hypergeomAtLeast(o.deckSize, o.hits, seen, o.atLeast);
  });
}

export type HitGroup =
  | { kind: "card"; id: string }
  | { kind: "counter2000" }
  | { kind: "blocker" }
  | { kind: "costMax"; max: number }
  | { kind: "trait"; trait: string }
  | { kind: "custom"; ids: string[] };

export function groupMatches(group: HitGroup, id: string, card: StatsAtlasCard): boolean {
  switch (group.kind) {
    case "card": return id === group.id;
    case "custom": return group.ids.includes(id);
    case "counter2000": return card.ctr === 2000;
    case "blocker": return (card.kw ?? []).includes("Blocker");
    case "costMax": return card.t !== "leader" && (card.cost ?? 0) <= group.max;
    case "trait": return (card.tr ?? []).includes(group.trait);
  }
}

export type DeckEntry = { id: string; copies: number; card: StatsAtlasCard };

export function deckEntries(cards: readonly DeckStatsCard[], atlas: StatsAtlas): DeckEntry[] {
  const copies = new Map<string, number>();
  for (const c of cards) {
    if (!(c.copies > 0)) continue;
    const id = normalizeCardId(c.id);
    copies.set(id, (copies.get(id) ?? 0) + c.copies);
  }
  const out: DeckEntry[] = [];
  for (const [id, n] of copies) {
    const card = atlas[id];
    if (card && card.t !== "leader") out.push({ id, copies: n, card });
  }
  return out;
}

export const deckSizeOf = (entries: readonly DeckEntry[]) => entries.reduce((s, e) => s + e.copies, 0);

export function countHits(entries: readonly DeckEntry[], group: HitGroup): number {
  return entries.reduce((s, e) => s + (groupMatches(group, e.id, e.card) ? e.copies : 0), 0);
}

// Ties broken by id so the default is stable.
export function defaultHitCardId(entries: readonly DeckEntry[]): string | null {
  let best: DeckEntry | null = null;
  for (const e of entries) if (!best || e.copies > best.copies || (e.copies === best.copies && e.id < best.id)) best = e;
  return best?.id ?? null;
}

const cmpOk = (c: unknown, v: number | undefined): boolean | null => {
  if (!c || typeof c !== "object") return null;
  const { op, value } = c as { op?: string; value?: unknown };
  if (typeof value !== "number") return null;
  const a = v ?? 0;
  switch (op) {
    case "<=": return a <= value;
    case ">=": return a >= value;
    case "==": return a === value;
    case "<": return a < value;
    case ">": return a > value;
    case "!=": return a !== value;
    default: return null;
  }
};

const strings = (v: unknown): string[] | null => (Array.isArray(v) && v.every((x) => typeof x === "string") ? (v as string[]) : null);

// Null when the filter uses a key (or value shape) the atlas cannot evaluate, so callers can say "can't estimate".
export function matchesFilter(card: StatsAtlasCard, filter: Record<string, unknown>): boolean | null {
  const names = [card.n, ...(card.al ?? [])].filter((n): n is string => typeof n === "string");
  let matched = true;
  for (const [key, val] of Object.entries(filter)) {
    let ok: boolean | null;
    switch (key) {
      case "types": { const l = strings(val); ok = l ? l.includes(card.t) : null; break; }
      case "traits": { const l = strings(val); ok = l ? l.some((t) => (card.tr ?? []).includes(t)) : null; break; }
      case "traitIncludes": { const l = strings(val); ok = l ? l.some((t) => (card.tr ?? []).some((tr) => tr.includes(t))) : null; break; }
      case "names": { const l = strings(val); ok = l ? l.some((n) => names.includes(n)) : null; break; }
      case "notNames": { const l = strings(val); ok = l ? !l.some((n) => names.includes(n)) : null; break; }
      case "colors": { const l = strings(val); ok = l ? l.some((c) => card.col.includes(c)) : null; break; }
      case "cost": ok = cmpOk(val, card.cost); break;
      case "power": ok = cmpOk(val, card.pow); break;
      case "hasTrigger": ok = typeof val === "boolean" ? Boolean(card.trg) === val : null; break;
      case "any": {
        if (!Array.isArray(val)) { ok = null; break; }
        const rs = val.map((f) => (f && typeof f === "object" ? matchesFilter(card, f as Record<string, unknown>) : null));
        ok = rs.includes(null) ? null : rs.some(Boolean);
        break;
      }
      case "all": {
        if (!Array.isArray(val)) { ok = null; break; }
        const rs = val.map((f) => (f && typeof f === "object" ? matchesFilter(card, f as Record<string, unknown>) : null));
        ok = rs.includes(null) ? null : rs.every(Boolean);
        break;
      }
      default: ok = null;
    }
    if (ok === null) return null;
    if (!ok) matched = false;
  }
  return matched;
}

export function cardLabel(id: string, card: StatsAtlasCard, copies?: number): string {
  const parts = [card.n ?? id];
  if (typeof card.cost === "number") parts.push(`Cost ${card.cost}`);
  if (card.n) parts.push(id);
  return parts.join(" · ") + (copies === undefined ? "" : ` (${copies}x)`);
}

export type SearcherRow = {
  id: string;
  name: string;
  cost?: number;
  look: number;
  hits: number | null;
  chance: number | null;
};

export function searcherOdds(entries: readonly DeckEntry[]): SearcherRow[] {
  const total = deckSizeOf(entries);
  const rows: SearcherRow[] = [];
  for (const s of entries) {
    for (const effect of s.card.srch ?? []) {
      let hits: number | null = 0;
      for (const e of entries) {
        const m = matchesFilter(e.card, effect.filter);
        if (m === null) { hits = null; break; }
        if (m) hits += e.id === s.id ? e.copies - 1 : e.copies;
      }
      const pool = total - 1;
      rows.push({
        id: s.id,
        name: s.card.n ?? s.id,
        cost: s.card.cost,
        look: effect.look,
        hits,
        chance: hits === null ? null : hypergeomAtLeast(pool, hits, Math.min(effect.look, pool), 1),
      });
    }
  }
  // Unknown chances last; ties by name for a stable order.
  return rows.sort((a, b) => (a.chance ?? 2) - (b.chance ?? 2) || a.name.localeCompare(b.name) || a.id.localeCompare(b.id));
}
