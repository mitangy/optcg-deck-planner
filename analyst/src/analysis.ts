/**
 * Deck analysis built on @optcg/deck-analytics, shaped for a model to read: card names next to
 * every number, percentages rounded, and the deck's legality problems first.
 */
import {
  computeDeckHints,
  computeDeckStats,
  countHits,
  deckEntries,
  deckSizeOf,
  oddsByTurn,
  searcherOdds,
  type HitGroup,
} from "@optcg/deck-analytics";
import type { Catalog } from "./catalog";
import type { Deck } from "./decks";

const pct = (p: number | null) => (p === null ? null : Math.round(p * 1000) / 10);

export function describeDeck(catalog: Catalog, deck: Deck) {
  const leader = deck.leaderId ? catalog.cards.get(deck.leaderId) : undefined;
  const cards = deck.cards
    .map((c) => {
      const row = catalog.cards.get(c.id);
      return { id: c.id, copies: c.copies, name: row?.name ?? c.id, type: row?.type, cost: row?.cost, power: row?.power, counter: row?.counter };
    })
    .sort((a, b) => (a.cost ?? 99) - (b.cost ?? 99) || a.id.localeCompare(b.id));
  return {
    name: deck.name,
    leader: leader ? { id: leader.id, name: leader.name, colors: leader.colors, life: leader.life, power: leader.power, text: leader.text } : null,
    mainDeckCount: cards.reduce((s, c) => s + c.copies, 0),
    cards,
    warnings: deck.warnings,
  };
}

export function analyzeDeck(catalog: Catalog, deck: Deck) {
  const stats = computeDeckStats(deck.cards, catalog.atlas, deck.leaderId);
  const hints = computeDeckHints(stats, deck.cards, catalog.atlas, deck.leaderId, { finished: true });
  const searchers = searcherOdds(deckEntries(deck.cards, catalog.atlas)).map((r) => ({ ...r, chance: pct(r.chance) }));
  const notImplemented = deck.cards
    .map((c) => catalog.cards.get(c.id))
    .filter((c) => c && (c.support === "partial" || c.support === "unsupported"))
    .map((c) => ({ id: c!.id, name: c!.name, support: c!.support }));
  return {
    deck: describeDeck(catalog, deck),
    legal: !hints.some((h) => h.tier === "rule") && deck.leaderId !== null,
    hints,
    stats: {
      total: stats.total,
      byType: stats.byType,
      costCurve: stats.costCurve.filter((b) => b.total > 0),
      powerCurve: stats.powerCurve,
      counter: stats.counter,
      keywords: stats.keywords,
      timing: stats.timing,
      roles: stats.roles,
      traits: stats.traits,
      triggers: stats.triggers,
      openingHand: stats.openingHand,
    },
    searchers,
    notImplemented,
    notes: [
      "Searcher chance is the % that the search finds at least one hit, counting only other cards in this deck.",
      ...(notImplemented.length ? ["Cards in notImplemented are not fully supported by the duel engine; that does not affect paper play."] : []),
    ],
  };
}

export type HitSpec = {
  cardIds?: string[];
  kind?: "counter2000" | "blocker" | "costMax" | "trait";
  costMax?: number;
  trait?: string;
};

export function hitGroup(spec: HitSpec): HitGroup {
  if (spec.cardIds?.length) return { kind: "custom", ids: spec.cardIds.map((id) => id.trim().toUpperCase()) };
  switch (spec.kind) {
    case "counter2000": return { kind: "counter2000" };
    case "blocker": return { kind: "blocker" };
    case "costMax":
      if (spec.costMax === undefined) throw new Error("costMax is required when kind is costMax.");
      return { kind: "costMax", max: spec.costMax };
    case "trait":
      if (!spec.trait) throw new Error("trait is required when kind is trait.");
      return { kind: "trait", trait: spec.trait };
    default:
      throw new Error("Say which cards count as hits: cardIds, or kind counter2000 / blocker / costMax / trait.");
  }
}

export type OddsQuery = { atLeast?: number; goingFirst?: boolean; mulligan?: boolean; turns?: number };

export function deckDrawOdds(catalog: Catalog, deck: Deck, spec: HitSpec, q: OddsQuery) {
  const entries = deckEntries(deck.cards, catalog.atlas);
  const deckSize = deckSizeOf(entries);
  const hits = countHits(entries, hitGroup(spec));
  return { deckSize, hits, ...rawDrawOdds(deckSize, hits, q) };
}

export function rawDrawOdds(deckSize: number, hits: number, q: OddsQuery) {
  if (!(deckSize > 0)) throw new Error("The deck is empty.");
  if (hits < 0 || hits > deckSize) throw new Error(`hits must be between 0 and ${deckSize}.`);
  const atLeast = q.atLeast ?? 1;
  const goingFirst = q.goingFirst ?? true;
  const mulligan = q.mulligan ?? false;
  const turns = Math.min(Math.max(q.turns ?? 6, 1), 12);
  const byTurn = oddsByTurn({ deckSize, hits, atLeast, goingFirst, mulligan, turns });
  return {
    atLeast,
    goingFirst,
    mulligan,
    byTurn: byTurn.map((p, i) => ({ turn: i + 1, percent: pct(p) })),
    notes: [
      "Turn N means your own Nth turn, after its draw step. Going first you skip the turn-1 draw; going second you draw on turn 1.",
      mulligan ? "Mulligan: redraw the opening 5 once if it has no hit." : "No mulligan.",
    ],
  };
}
