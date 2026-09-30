/**
 * Build hints for the deck editor (pure, no React). Rule breaks are soft warnings: nothing
 * here ever blocks an add or remove. Thresholds live in HINT_THRESHOLDS so they are easy to tune.
 */
import { computeDeckStats, normalizeStatsCardId, type DeckStats, type DeckStatsCard, type StatsAtlas } from "./deckStats";
import { deckEntries, searcherOdds } from "./drawOdds";

export const HINT_THRESHOLDS = {
  /** Main deck size, leader and DON!! excluded. */
  deckSize: 50,
  maxCopies: 4,
  /** Shape and synergy hints stay quiet until this many counted cards are in the deck. */
  minCardsForAdvice: 40,
  earlyCostMax: 3,
  /** Fewer plays than this at cost 1..earlyCostMax is a thin early game. */
  minEarlyPlays: 10,
  lateCostMin: 7,
  /** More cards than this at cost lateCostMin+ is top-heavy. */
  maxLatePlays: 8,
  minAvgCounter: 1000,
  /** A searcher that finds a hit less often than this is weak. */
  minSearcherChance: 0.75,
  /** A searcher whose filter matches this many other deck cards or fewer is dead. */
  deadFilterMaxHits: 3,
  /** A {Trait} named by the leader is flagged when fewer deck cards than this have it. */
  traitSupportBelow: 16,
} as const;

export type HintTier = "rule" | "shape" | "synergy";

export type DeckHint = { id: string; tier: HintTier; title: string; detail: string; cardIds?: string[] };

export type HintOptions = {
  /** The user is done adding (tapped "Done editing" or is viewing the deck): surface the 50-card count. */
  finished?: boolean;
};

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`;

function ruleText(rule: string, leaderName: string): string {
  const [kind, arg] = rule.split(":");
  if (kind === "max_cost") return `${leaderName} cannot include cards with a cost of ${Number(arg) + 1} or more.`;
  if (kind === "no_events_cost_ge") return `${leaderName} cannot include Events with a cost of ${arg} or more.`;
  if (kind === "only_trait") return `${leaderName} can only include {${arg}} type cards.`;
  return `This deck breaks a rule printed on ${leaderName}.`;
}

/** Copies per normalized card number, leader and leader-typed cards excluded, unknown ids included. */
function mainCopies(cards: readonly DeckStatsCard[], atlas: StatsAtlas, leaderId?: string | null): Map<string, number> {
  const leaderKey = leaderId ? normalizeStatsCardId(leaderId) : null;
  const out = new Map<string, number>();
  for (const c of cards) {
    if (!(c.copies > 0)) continue;
    const id = normalizeStatsCardId(c.id);
    if (id === leaderKey || atlas[id]?.t === "leader") continue;
    out.set(id, (out.get(id) ?? 0) + c.copies);
  }
  return out;
}

const TIER_ORDER: Record<HintTier, number> = { rule: 0, shape: 1, synergy: 2 };

export function computeDeckHints(
  stats: DeckStats,
  deckCards: readonly DeckStatsCard[],
  atlas: StatsAtlas,
  leaderId?: string | null,
  opts: HintOptions = {},
): DeckHint[] {
  const T = HINT_THRESHOLDS;
  const hints: DeckHint[] = [];
  const copies = mainCopies(deckCards, atlas, leaderId);
  const count = [...copies.values()].reduce((s, n) => s + n, 0);
  const leader = leaderId ? atlas[normalizeStatsCardId(leaderId)] : undefined;
  const leaderName = leader?.n ?? "The leader";

  // Rule
  if (count !== T.deckSize && (opts.finished || count > T.deckSize)) {
    hints.push({
      id: "count",
      tier: "rule",
      title: `${count} of ${T.deckSize} cards`,
      detail: `A legal deck has exactly ${T.deckSize} cards besides the leader and DON!!. This one has ${count}.`,
    });
  }
  const over = [...copies].filter(([, n]) => n > T.maxCopies).map(([id]) => id).sort();
  if (over.length) {
    hints.push({
      id: "copies",
      tier: "rule",
      title: `Over ${T.maxCopies} copies`,
      detail: `A deck may hold at most ${T.maxCopies} copies of one card number. ${plural(over.length, "card")} ${over.length === 1 ? "has" : "have"} more.`,
      cardIds: over,
    });
  }
  if (stats.leader && stats.leader.offColorIds.length) {
    const n = stats.leader.offColorIds.length;
    hints.push({
      id: "offcolor",
      tier: "rule",
      title: `${plural(n, "off-color card")}`,
      detail: `${plural(n, "card")} ${n === 1 ? "shares" : "share"} no color with the leader (${stats.leader.colors.join("/")}).`,
      cardIds: stats.leader.offColorIds,
    });
  }
  for (const v of stats.leader?.ruleViolations ?? []) {
    hints.push({ id: `leader-rule:${v.rule}`, tier: "rule", title: "Leader rule broken", detail: ruleText(v.rule, leaderName), cardIds: v.cardIds });
  }

  // Shape
  if (stats.total >= T.minCardsForAdvice) {
    let early = 0;
    for (let c = 1; c <= T.earlyCostMax; c++) early += stats.costCurve[c]?.total ?? 0;
    if (early < T.minEarlyPlays) {
      hints.push({
        id: "thin-early",
        tier: "shape",
        title: "Thin early game",
        detail: `Only ${plural(early, "card")} cost 1-${T.earlyCostMax}. Aim for at least ${T.minEarlyPlays} so you can play every early turn.`,
      });
    }
    let late = 0;
    for (let c = T.lateCostMin; c < stats.costCurve.length; c++) late += stats.costCurve[c]?.total ?? 0;
    if (late > T.maxLatePlays) {
      hints.push({
        id: "top-heavy",
        tier: "shape",
        title: "Top-heavy",
        detail: `${plural(late, "card")} cost ${T.lateCostMin}+. More than ${T.maxLatePlays} can leave you with dead hands.`,
      });
    }
    if (stats.counter.average < T.minAvgCounter || stats.counter.events === 0) {
      const why: string[] = [];
      if (stats.counter.average < T.minAvgCounter) why.push(`average counter is ${Math.round(stats.counter.average)}, under ${T.minAvgCounter}`);
      if (stats.counter.events === 0) why.push("there are no Counter events");
      hints.push({ id: "low-defense", tier: "shape", title: "Low defense", detail: `Defense looks light: ${why.join(" and ")}.` });
    }
  }

  // Searchers (weak = low chance, dead = filter nearly matches nothing; dead wins so a card is flagged once)
  if (stats.total >= T.minCardsForAdvice) {
    const seen = new Set<string>();
    for (const row of searcherOdds(deckEntries(deckCards, atlas))) {
      if (row.hits === null || row.chance === null || seen.has(row.id)) continue;
      seen.add(row.id);
      if (row.hits <= T.deadFilterMaxHits) {
        hints.push({
          id: `dead-filter:${row.id}`,
          tier: "synergy",
          title: `Dead searcher filter: ${row.name}`,
          detail: `${row.name} looks at ${row.look} cards but only ${plural(row.hits, "other card")} in the deck can be picked.`,
          cardIds: [row.id],
        });
      } else if (row.chance < T.minSearcherChance) {
        const pct = Math.round(row.chance * 100);
        hints.push({
          id: `weak-searcher:${row.id}`,
          tier: "shape",
          title: `Weak searcher: ${row.name} hits only ${row.hits} cards, ${pct}%`,
          detail: `${row.name} looks at ${row.look} cards and only ${row.hits} can be picked, so it finds one about ${pct}% of the time.`,
          cardIds: [row.id],
        });
      }
    }
  }

  // Leader traits
  if (leader?.lt && stats.total >= T.minCardsForAdvice) {
    for (const trait of leader.lt) {
      let n = 0;
      for (const [id, c] of copies) if (atlas[id]?.tr?.includes(trait)) n += c;
      if (n < T.traitSupportBelow) {
        hints.push({
          id: `synergy:${trait}`,
          tier: "synergy",
          title: `Leader supports {${trait}}: ${n} of ${T.deckSize} cards have it`,
          detail: `${leaderName} names {${trait}} in its text, but only ${n} of your ${T.deckSize} cards have that trait.`,
        });
      }
    }
  }

  return hints.sort((a, b) => TIER_ORDER[a.tier] - TIER_ORDER[b.tier]);
}

/** Split hints by the user's dismissals. Unknown dismissed ids are ignored. */
export function splitDismissed(hints: readonly DeckHint[], dismissed: readonly string[]): { visible: DeckHint[]; dismissed: DeckHint[] } {
  const gone = new Set(dismissed);
  return { visible: hints.filter((h) => !gone.has(h.id)), dismissed: hints.filter((h) => gone.has(h.id)) };
}

const fmtK = (n: number) => `${(n / 1000).toFixed(2)}k`;

/**
 * What one add/remove moved: a hint that appeared or cleared, the touched cost bucket, and the
 * average counter. Returns at most two parts joined by " · ", or null when nothing notable moved.
 */
export function deckDelta(
  before: readonly DeckStatsCard[],
  after: readonly DeckStatsCard[],
  cardId: string,
  atlas: StatsAtlas,
  leaderId?: string | null,
  opts: HintOptions = {},
): string | null {
  const a = computeDeckStats(before, atlas, leaderId);
  const b = computeDeckStats(after, atlas, leaderId);
  const parts: string[] = [];

  const ha = computeDeckHints(a, before, atlas, leaderId, opts);
  const hb = computeDeckHints(b, after, atlas, leaderId, opts);
  const idsA = new Set(ha.map((h) => h.id));
  const idsB = new Set(hb.map((h) => h.id));
  const appeared = hb.find((h) => !idsA.has(h.id));
  const cleared = ha.find((h) => !idsB.has(h.id));
  if (appeared) parts.push(`New hint: ${appeared.title}`);
  else if (cleared) parts.push(`Cleared: ${cleared.title}`);

  const card = atlas[normalizeStatsCardId(cardId)];
  if (card && card.t !== "leader") {
    const bucket = Math.min(Math.max(card.cost ?? 0, 0), a.costCurve.length - 1);
    const x = a.costCurve[bucket]!.total;
    const y = b.costCurve[bucket]!.total;
    if (x !== y) parts.push(`Cost ${bucket}${bucket === a.costCurve.length - 1 ? "+" : ""}: ${x} → ${y}`);
  }
  if (fmtK(a.counter.average) !== fmtK(b.counter.average)) parts.push(`Avg counter ${fmtK(a.counter.average)} → ${fmtK(b.counter.average)}`);

  return parts.length ? parts.slice(0, 2).join(" · ") : null;
}
