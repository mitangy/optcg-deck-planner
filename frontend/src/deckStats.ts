/**
 * Pure deck statistics (no React, no network) so the planner and duel-web can share it.
 * Input is a card list plus the compact per-card atlas exported by
 * `packages/rules` (`npm run export-planner-stats` -> public/deckStats.json).
 */

export type StatsCardType = "character" | "event" | "stage" | "leader";

export type StatsSearch = { look: number; filter: Record<string, unknown> };

/** One card in `deckStats.json` (short keys keep the download small). */
export type StatsAtlasCard = {
  /** Printed name, plus name_alias names in `al`. */
  n?: string;
  al?: string[];
  t: StatsCardType;
  col: string[];
  cost?: number;
  pow?: number;
  ctr?: number;
  life?: number;
  tr?: string[];
  at?: string[];
  trg?: 1;
  kw?: string[];
  tm?: string[];
  rl?: string[];
  rules?: string[];
  srch?: StatsSearch[];
};

export type StatsAtlas = Record<string, StatsAtlasCard>;

export type DeckStatsCard = { id: string; copies: number };

export type NameCount = { name: string; count: number };

export type CostBucket = { cost: number; character: number; event: number; stage: number; total: number };

export type RuleViolation = { rule: string; cardIds: string[] };

export type DeckStats = {
  /** Copies counted (leader, DON!! and unknown ids excluded). */
  total: number;
  /** Copies whose id is missing from the atlas (not counted anywhere else). */
  unknown: number;
  byType: { character: number; event: number; stage: number };
  /** Index 0..10; index 10 holds every card costing 10 or more. */
  costCurve: CostBucket[];
  /** Characters only, floor(power / 1000) * 1000, contiguous from lowest to highest bucket. */
  powerCurve: { power: number; count: number }[];
  counter: {
    totalCounter: number;
    /** Total counter over all counted copies; cards without a counter count as 0. */
    average: number;
    none: number;
    c1000: number;
    c2000: number;
    /** Printed counters other than 1000 / 2000. */
    other: number;
    /** Event cards with a [Counter] ability. */
    events: number;
  };
  keywords: NameCount[];
  timing: NameCount[];
  traits: NameCount[];
  attributes: NameCount[];
  colors: NameCount[];
  roles: NameCount[];
  triggers: number;
  openingHand: { size: number; expectedCounter: number; expectedTriggers: number };
  leader: {
    id: string;
    colors: string[];
    ruleViolations: RuleViolation[];
    /** Card ids sharing no color with the leader. */
    offColorIds: string[];
  } | null;
};

export const COST_CURVE_MAX = 10;
export const OPENING_HAND = 5;

/** Planner ids are base ids; alt-art / parallel suffixes (`_p1`, `_r1`) map to the base card. */
export function normalizeStatsCardId(id: string): string {
  return id.trim().toUpperCase().replace(/_(?:P\d+|R\d+)$/, "");
}

function bump(map: Map<string, number>, key: string, by: number): void {
  map.set(key, (map.get(key) ?? 0) + by);
}

function ranked(map: Map<string, number>, limit?: number): NameCount[] {
  const rows = [...map.entries()]
    .map(([name, count]) => ({ name, count }))
    .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));
  return limit === undefined ? rows : rows.slice(0, limit);
}

const ROLE_LABEL: Record<string, string> = {
  draw: "Draw",
  search: "Search",
  removal: "Removal",
  ramp: "DON!! ramp",
  lifeGain: "Life gain",
};

/** Mirrors `deckConstructionErrors` in packages/rules (deck_rule statics on Leaders). */
function ruleOffends(rule: string, card: StatsAtlasCard): boolean {
  const [kind, arg] = rule.split(":");
  if (kind === "max_cost") return (card.cost ?? 0) > Number(arg);
  if (kind === "no_events_cost_ge") return card.t === "event" && (card.cost ?? 0) >= Number(arg);
  if (kind === "only_trait") return !(card.tr ?? []).includes(arg ?? "");
  return false;
}

export function computeDeckStats(
  cards: readonly DeckStatsCard[],
  atlas: StatsAtlas,
  leaderId?: string | null,
  opts: { topTraits?: number } = {},
): DeckStats {
  const copiesById = new Map<string, number>();
  for (const c of cards) {
    if (!(c.copies > 0)) continue;
    bump(copiesById, normalizeStatsCardId(c.id), c.copies);
  }

  const costCurve: CostBucket[] = Array.from({ length: COST_CURVE_MAX + 1 }, (_, cost) => ({ cost, character: 0, event: 0, stage: 0, total: 0 }));
  const powers = new Map<number, number>();
  const keywords = new Map<string, number>();
  const timing = new Map<string, number>();
  const traits = new Map<string, number>();
  const attributes = new Map<string, number>();
  const colors = new Map<string, number>();
  const roles = new Map<string, number>();
  const byType = { character: 0, event: 0, stage: 0 };
  const counter = { totalCounter: 0, average: 0, none: 0, c1000: 0, c2000: 0, other: 0, events: 0 };
  let total = 0;
  let unknown = 0;
  let triggers = 0;

  const leaderKey = leaderId ? normalizeStatsCardId(leaderId) : null;
  const leader = leaderKey ? atlas[leaderKey] : undefined;
  const ruleIds = new Map<string, Set<string>>();
  const offColorIds: string[] = [];

  for (const [id, copies] of copiesById) {
    const card = atlas[id];
    if (!card) {
      unknown += copies;
      continue;
    }
    if (card.t === "leader") continue;
    total += copies;
    byType[card.t] += copies;

    const bucket = costCurve[Math.min(Math.max(card.cost ?? 0, 0), COST_CURVE_MAX)]!;
    bucket[card.t] += copies;
    bucket.total += copies;

    if (card.t === "character" && card.pow != null) {
      const step = Math.floor(card.pow / 1000) * 1000;
      powers.set(step, (powers.get(step) ?? 0) + copies);
    }

    const ctr = card.ctr ?? 0;
    counter.totalCounter += ctr * copies;
    if (ctr === 0) counter.none += copies;
    else if (ctr === 1000) counter.c1000 += copies;
    else if (ctr === 2000) counter.c2000 += copies;
    else counter.other += copies;
    if (card.t === "event" && (card.tm ?? []).includes("Counter")) counter.events += copies;

    if (card.trg) triggers += copies;
    for (const k of card.kw ?? []) bump(keywords, k, copies);
    for (const k of card.tm ?? []) bump(timing, k, copies);
    for (const k of card.tr ?? []) bump(traits, k, copies);
    for (const k of card.at ?? []) bump(attributes, k, copies);
    for (const k of card.col) bump(colors, k, copies);
    for (const k of card.rl ?? []) bump(roles, ROLE_LABEL[k] ?? k, copies);

    if (leader) {
      for (const rule of leader.rules ?? []) {
        if (!ruleOffends(rule, card)) continue;
        const set = ruleIds.get(rule) ?? new Set<string>();
        set.add(id);
        ruleIds.set(rule, set);
      }
      if (!card.col.some((c) => leader.col.includes(c))) offColorIds.push(id);
    }
  }

  counter.average = total ? counter.totalCounter / total : 0;

  const powerKeys = [...powers.keys()];
  const powerCurve: { power: number; count: number }[] = [];
  if (powerKeys.length) {
    const lo = Math.min(...powerKeys);
    const hi = Math.max(...powerKeys);
    for (let p = lo; p <= hi; p += 1000) powerCurve.push({ power: p, count: powers.get(p) ?? 0 });
  }

  const size = Math.min(OPENING_HAND, total);
  return {
    total,
    unknown,
    byType,
    costCurve,
    powerCurve,
    counter,
    keywords: ranked(keywords),
    timing: ranked(timing),
    traits: ranked(traits, opts.topTraits ?? 8),
    attributes: ranked(attributes),
    colors: ranked(colors),
    roles: ranked(roles),
    triggers,
    openingHand: {
      size,
      expectedCounter: total ? (size * counter.totalCounter) / total : 0,
      expectedTriggers: total ? (size * triggers) / total : 0,
    },
    leader:
      leaderKey && leader
        ? {
            id: leaderKey,
            colors: [...leader.col],
            ruleViolations: [...ruleIds.entries()].map(([rule, ids]) => ({ rule, cardIds: [...ids].sort() })),
            offColorIds: offColorIds.sort(),
          }
        : null,
  };
}
